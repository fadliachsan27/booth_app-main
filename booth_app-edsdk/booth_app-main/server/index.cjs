// Photobooth local backend — Express + node:sqlite (no native deps).
//
// Runs on the "host PC" at the booth. The tablet/kiosk opens the web UI which
// talks to this server for: photo storage + QR download, DSLR tethered capture
// (Canon EDSDK, digiCamControl on Windows, or gphoto2), printing, frame
// templates, and operator config.
//
// Env:
//   PORT             — HTTP port (default 4000)
//   PUBLIC_BASE_URL  — base URL put into the QR code (default: http://<LAN-IP>:PORT)

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const express = require("express");
const cors = require("cors");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 4000;
const IS_WIN = process.platform === "win32";
// DATA_DIR can point at a persistent disk (e.g. Render/Railway volume).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DIST_DIR = path.join(__dirname, "..", "dist");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CAPTURE_DIR = path.join(DATA_DIR, "captures");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CAPTURE_DIR, { recursive: true });

/* ---------- database ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, "booth.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id            TEXT PRIMARY KEY,
    filename      TEXT NOT NULL,
    template_id   TEXT,
    template_name TEXT,
    price         INTEGER DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    sort       INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const q = {
  insertPhoto: db.prepare(
    `INSERT INTO photos (id, filename, template_id, template_name, price, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  getPhoto: db.prepare(`SELECT * FROM photos WHERE id = ?`),
  listPhotos: db.prepare(`SELECT * FROM photos ORDER BY created_at DESC`),
  deleteAllPhotos: db.prepare(`DELETE FROM photos`),
  listTemplates: db.prepare(`SELECT * FROM templates ORDER BY sort ASC, updated_at ASC`),
  upsertTemplate: db.prepare(
    `INSERT INTO templates (id, data, sort, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, sort = excluded.sort, updated_at = excluded.updated_at`,
  ),
  deleteTemplate: db.prepare(`DELETE FROM templates WHERE id = ?`),
  getConfig: db.prepare(`SELECT value FROM config WHERE key = 'main'`),
  setConfig: db.prepare(
    `INSERT INTO config (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ),
};

/* ---------- config ---------- */
const DEFAULT_CONFIG = {
  camera: {
    source: "webcam", // "webcam" | "dslr-edsdk" | "dslr-dcc" | "dslr-gphoto2"
    dccUrl: "http://localhost:5513", // digiCamControl web server
    gphoto2Bin: "gphoto2",
    // Optional override for the Canon EDSDK library. Empty = the copy bundled
    // in server/edsdk/vendor/ for this platform.
    edsdkLib: "",
    countdown: 7,
  },
  printer: {
    enabled: false,
    autoPrint: false,
    name: "", // OS printer name; empty = Windows default printer
    copies: 1,
    // {file} {printer} {copies} are substituted. Empty = built-in per-OS default.
    command: "",
  },
  pricing: { sessionPrice: 25000 },
  payment: {
    enabled: false,
    // "Tunai" is always offered. QRIS appears when one of these is set:
    qrisImage: "", // data-URL of a static QRIS image
    qrisPayload: "", // raw EMVCo QRIS payload string (00020101...)
    note: "",
  },
};

function loadConfig() {
  try {
    const row = q.getConfig.get();
    if (row) return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_CONFIG };
}
function saveConfig(patch) {
  const cur = loadConfig();
  const next = {
    ...cur,
    ...patch,
    camera: { ...cur.camera, ...(patch.camera || {}) },
    printer: { ...cur.printer, ...(patch.printer || {}) },
    pricing: { ...cur.pricing, ...(patch.pricing || {}) },
    payment: { ...cur.payment, ...(patch.payment || {}) },
  };
  q.setConfig.run(JSON.stringify(next));
  return next;
}

/* ---------- helpers ---------- */
function lanIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}
const LAN_BASE = `http://${lanIp()}:${PORT}`;

/** Base URL used in QR codes / download links. Priority:
 *  PUBLIC_BASE_URL env → the request's own host (works on any cloud host) → LAN IP. */
function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (req) {
    const host = req.get("x-forwarded-host") || req.get("host");
    if (host) return `${req.protocol}://${host}`;
  }
  return LAN_BASE;
}

function photoEntry(row, req) {
  const base = baseUrl(req);
  return {
    id: row.id,
    templateId: row.template_id || "",
    templateName: row.template_name || "",
    price: row.price || 0,
    timestamp: row.created_at,
    date: new Date(row.created_at).toISOString().split("T")[0],
    downloadUrl: `${base}/d/${row.id}`,
    fileUrl: `${base}/api/photos/${row.id}/file`,
  };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr, stdout }));
      resolve({ stdout, stderr });
    });
  });
}

function newestFile(dir, sinceMs) {
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.jpe?g$/i.test(name)) continue;
    const st = fs.statSync(path.join(dir, name));
    if (st.mtimeMs >= sinceMs && (!best || st.mtimeMs > best.mtimeMs)) {
      best = { path: path.join(dir, name), mtimeMs: st.mtimeMs };
    }
  }
  return best;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- DSLR capture ---------- */

// Canon EDSDK — loaded lazily so that hosts without the SDK (or without koffi,
// e.g. a cloud webcam-only deploy) still start normally.
let edsdkMod = null;
let edsdkLoadError = "";
function edsdk() {
  if (edsdkMod) return edsdkMod;
  if (edsdkLoadError) throw new Error(edsdkLoadError);
  try {
    edsdkMod = require("./edsdk/index.cjs");
  } catch (err) {
    edsdkLoadError = `Canon EDSDK module unavailable: ${err.message}`;
    throw new Error(edsdkLoadError);
  }
  return edsdkMod;
}

async function captureEdsdk(cfg) {
  const { buffer, filename } = await edsdk().capture({ libPath: cfg.camera.edsdkLib });
  // Keep the untouched original next to the other tethered captures.
  try {
    const safe = String(filename).replace(/[^\w.-]/g, "_");
    fs.writeFileSync(path.join(CAPTURE_DIR, `eds_${Date.now()}_${safe}`), buffer);
  } catch {
    /* the in-memory buffer is what matters — disk copy is best effort */
  }
  return buffer;
}

async function dccRequest(dccUrl, params) {
  const url = `${dccUrl.replace(/\/$/, "")}/?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`digiCamControl ${res.status}: ${text.slice(0, 200)}`);
  return text.trim();
}

async function captureDcc(cfg) {
  const dccUrl = cfg.camera.dccUrl || "http://localhost:5513";
  // Point digiCamControl at our capture folder, then trigger a capture.
  await dccRequest(dccUrl, { slc: "set", param1: "session.folder", param2: CAPTURE_DIR }).catch(() => {});
  await dccRequest(dccUrl, { slc: "set", param1: "session.filenametemplate", param2: "cap_[Date yyyy-MM-dd-HH-mm-ss]" }).catch(() => {});
  const started = Date.now() - 1000;
  try {
    await dccRequest(dccUrl, { slc: "capture", param1: "", param2: "" });
  } catch {
    await dccRequest(dccUrl, { CMD: "Capture" }); // legacy fallback
  }
  // Wait for the downloaded JPEG to appear.
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const f = newestFile(CAPTURE_DIR, started);
    if (f && Date.now() - f.mtimeMs > 300) return fs.readFileSync(f.path);
  }
  throw new Error("digiCamControl: no image downloaded (is a camera connected & the web server enabled?)");
}

async function captureGphoto2(cfg) {
  const bin = cfg.camera.gphoto2Bin || "gphoto2";
  const out = path.join(CAPTURE_DIR, `gp_${Date.now()}.jpg`);
  await run(bin, ["--capture-image-and-download", "--filename", out, "--force-overwrite"]);
  if (!fs.existsSync(out)) throw new Error("gphoto2: capture produced no file");
  return fs.readFileSync(out);
}

/* ---------- printing ---------- */
async function listPrinters() {
  try {
    if (IS_WIN) {
      const { stdout } = await run("powershell", [
        "-NoProfile", "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name",
      ]);
      return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    const { stdout } = await run("lpstat", ["-e"]);
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Windows default printer name (so we can print silently with mspaint /pt).
async function defaultPrinter() {
  if (!IS_WIN) return "";
  try {
    const { stdout } = await run("powershell", [
      "-NoProfile", "-Command",
      "(Get-CimInstance -Class Win32_Printer -Filter 'Default = True').Name",
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function printFile(filePath, cfg) {
  const p = cfg.printer;
  const copies = Math.max(1, Number(p.copies) || 1);
  if (p.command && p.command.trim()) {
    const cmd = p.command
      .replaceAll("{file}", filePath)
      .replaceAll("{printer}", p.name || "")
      .replaceAll("{copies}", String(copies));
    // naive split respecting simple quotes
    const parts = cmd.match(/"[^"]+"|\S+/g).map((s) => s.replace(/^"|"$/g, ""));
    await run(parts[0], parts.slice(1), { shell: false });
    return;
  }
  if (IS_WIN) {
    const target = p.name || (await defaultPrinter());
    for (let i = 0; i < copies; i++) {
      // /pt = silent print to a named printer; falls back to /p (dialog) if
      // we somehow could not resolve any printer name.
      const args = target ? ["/pt", filePath, target] : ["/p", filePath];
      await run("mspaint.exe", args);
    }
    return;
  }
  const args = ["-n", String(copies)];
  if (p.name) args.push("-d", p.name);
  args.push(filePath);
  await run("lp", args);
}

/* ---------- app ---------- */
const app = express();
app.set("trust proxy", true); // honour x-forwarded-proto/host on cloud hosts
app.use(cors());
app.use(express.json({ limit: "40mb" }));

app.get("/api/health", (req, res) =>
  res.json({ ok: true, baseUrl: baseUrl(req), platform: process.platform }),
);

/* --- config --- */
app.get("/api/config", (_req, res) => res.json(loadConfig()));
app.put("/api/config", (req, res) => {
  try {
    res.json(saveConfig(req.body || {}));
  } catch (err) {
    console.error("PUT /api/config", err);
    res.status(500).json({ error: "failed to save config" });
  }
});

/* --- templates --- */
app.get("/api/templates", (_req, res) => {
  res.json(q.listTemplates.all().map((r) => JSON.parse(r.data)));
});
app.put("/api/templates", (req, res) => {
  // Replace the whole set (array of template objects). Order = sort.
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    const now = Date.now();
    db.exec("DELETE FROM templates");
    list.forEach((tpl, i) => {
      if (tpl && tpl.id) q.upsertTemplate.run(String(tpl.id), JSON.stringify(tpl), i, now);
    });
    res.json(q.listTemplates.all().map((r) => JSON.parse(r.data)));
  } catch (err) {
    console.error("PUT /api/templates", err);
    res.status(500).json({ error: "failed to save templates" });
  }
});
app.post("/api/templates", (req, res) => {
  try {
    const tpl = req.body;
    if (!tpl || !tpl.id) return res.status(400).json({ error: "template.id required" });
    const n = q.listTemplates.all().length;
    q.upsertTemplate.run(String(tpl.id), JSON.stringify(tpl), n, Date.now());
    res.json(tpl);
  } catch (err) {
    console.error("POST /api/templates", err);
    res.status(500).json({ error: "failed" });
  }
});
app.delete("/api/templates/:id", (req, res) => {
  q.deleteTemplate.run(req.params.id);
  res.json({ ok: true });
});

/* --- camera --- */
app.get("/api/camera/status", async (_req, res) => {
  const cfg = loadConfig();
  if (cfg.camera.source === "dslr-edsdk") {
    try {
      const r = await edsdk().status({ libPath: cfg.camera.edsdkLib });
      return res.json({ source: "dslr-edsdk", ...r });
    } catch (err) {
      return res.json({ source: "dslr-edsdk", reachable: false, error: String(err.message || err) });
    }
  }
  if (cfg.camera.source === "dslr-dcc") {
    try {
      const info = await dccRequest(cfg.camera.dccUrl, { slc: "get", param1: "camera.status" });
      return res.json({ source: "dslr-dcc", reachable: true, info });
    } catch (err) {
      return res.json({ source: "dslr-dcc", reachable: false, error: String(err.message || err) });
    }
  }
  if (cfg.camera.source === "dslr-gphoto2") {
    try {
      const { stdout } = await run(cfg.camera.gphoto2Bin || "gphoto2", ["--auto-detect"]);
      const reachable = /usb:/i.test(stdout);
      return res.json({ source: "dslr-gphoto2", reachable, info: stdout.trim() });
    } catch (err) {
      return res.json({ source: "dslr-gphoto2", reachable: false, error: String(err.message || err) });
    }
  }
  res.json({ source: "webcam", reachable: true });
});

// Trigger one tethered capture. Returns { imageBase64 }.
app.post("/api/capture", async (_req, res) => {
  const cfg = loadConfig();
  try {
    let buf;
    if (cfg.camera.source === "dslr-edsdk") buf = await captureEdsdk(cfg);
    else if (cfg.camera.source === "dslr-dcc") buf = await captureDcc(cfg);
    else if (cfg.camera.source === "dslr-gphoto2") buf = await captureGphoto2(cfg);
    else return res.status(400).json({ error: "camera source is 'webcam' — capture happens in the browser" });
    res.json({ imageBase64: `data:image/jpeg;base64,${buf.toString("base64")}` });
  } catch (err) {
    console.error("POST /api/capture", err);
    res.status(502).json({ error: String(err.message || err) });
  }
});

// Live view frame for whichever DSLR backend is active (best effort).
app.get("/api/liveview.jpg", async (_req, res) => {
  const cfg = loadConfig();
  if (cfg.camera.source === "dslr-edsdk") {
    try {
      const frame = await edsdk().liveViewFrame({ libPath: cfg.camera.edsdkLib });
      if (!frame) return res.status(503).end(); // warming up — the UI just retries
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "no-store");
      return res.send(frame);
    } catch {
      return res.status(502).end();
    }
  }
  if (cfg.camera.source !== "dslr-dcc") return res.status(404).end();
  try {
    await dccRequest(cfg.camera.dccUrl, { slc: "liveview", param1: "start" }).catch(() => {});
    const r = await fetch(`${cfg.camera.dccUrl.replace(/\/$/, "")}/liveview.jpg`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.status(502).end();
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

/* --- printing --- */
app.get("/api/printers", async (_req, res) => res.json({ printers: await listPrinters() }));

app.post("/api/print", async (req, res) => {
  const cfg = loadConfig();
  const { id } = req.body || {};
  const row = id ? q.getPhoto.get(id) : null;
  if (!row) return res.status(404).json({ error: "photo not found" });
  try {
    await printFile(path.join(UPLOAD_DIR, row.filename), cfg);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/print", err);
    res.status(502).json({ error: String(err.message || err) });
  }
});

/* --- photos --- */
app.post("/api/photos", async (req, res) => {
  try {
    const { imageBase64, templateId, templateName, price } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 required" });
    }
    const base64 = imageBase64.includes(",")
      ? imageBase64.slice(imageBase64.indexOf(",") + 1)
      : imageBase64;
    const buf = Buffer.from(base64, "base64");
    if (buf.length === 0) return res.status(400).json({ error: "empty image" });

    const id = crypto.randomBytes(6).toString("hex");
    const filename = `${id}.jpg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
    const createdAt = Date.now();
    q.insertPhoto.run(
      id, filename, templateId ?? null, templateName ?? null,
      Math.round(Number(price) || 0), createdAt,
    );
    const entry = photoEntry(q.getPhoto.get(id), req);

    // Optional auto-print
    const cfg = loadConfig();
    if (cfg.printer.enabled && cfg.printer.autoPrint) {
      printFile(path.join(UPLOAD_DIR, filename), cfg).catch((e) =>
        console.warn("[auto-print] failed:", e.message),
      );
    }
    res.json(entry);
  } catch (err) {
    console.error("POST /api/photos", err);
    res.status(500).json({ error: "failed to save photo" });
  }
});

app.get("/api/photos", (req, res) => res.json(q.listPhotos.all().map((r) => photoEntry(r, req))));

app.delete("/api/photos", (_req, res) => {
  for (const row of q.listPhotos.all()) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, row.filename)); } catch { /* ignore */ }
  }
  q.deleteAllPhotos.run();
  res.json({ ok: true });
});

app.get("/api/photos/:id/file", (req, res) => {
  const row = q.getPhoto.get(req.params.id);
  if (!row) return res.status(404).send("Not found");
  res.sendFile(path.join(UPLOAD_DIR, row.filename));
});

app.get("/d/:id", (req, res) => {
  const row = q.getPhoto.get(req.params.id);
  if (!row) {
    return res.status(404).type("html").send("<h1>Foto tidak ditemukan</h1>");
  }
  const fileUrl = `${baseUrl(req)}/api/photos/${row.id}/file`;
  res.type("html").send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Download Foto</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#0a0a0a;color:#ededed;min-height:100vh;display:flex;flex-direction:column;
    align-items:center;justify-content:center;padding:24px;gap:20px}
  h1{font-size:18px;font-weight:600}
  img{max-width:min(420px,90vw);width:100%;border-radius:12px;border:1px solid #222}
  a.btn{display:inline-flex;align-items:center;gap:8px;background:#ededed;color:#0a0a0a;
    text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px;font-size:14px}
  p{color:#888;font-size:12px;text-align:center}
</style></head><body>
  <h1>Foto kamu sudah siap</h1>
  <img src="${fileUrl}" alt="Foto photobooth" />
  <a class="btn" href="${fileUrl}" download="photobooth_${row.id}.jpg">⬇ Download Foto</a>
  <p>Tekan &amp; tahan gambar lalu pilih "Simpan Gambar" jika tombol tidak berfungsi.</p>
</body></html>`);
});

/* ---------- static frontend (single-service deploy) ---------- */
// When `dist/` exists (after `npm run build`) this server also serves the UI,
// so the whole app is one deployable service.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/d/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const server = app.listen(PORT, "0.0.0.0", () => {
  const cam = loadConfig().camera;
  let camLine = cam.source;
  if (cam.source === "dslr-edsdk") {
    try {
      const a = edsdk().isAvailable({ libPath: cam.edsdkLib });
      camLine += a.ok ? `  (${a.libPath})` : `  — NOT READY: ${a.reason}`;
    } catch (err) {
      camLine += `  — NOT READY: ${err.message}`;
    }
  }
  console.log(`\n  Photobooth server  →  ${process.env.PUBLIC_BASE_URL || LAN_BASE}`);
  console.log(`  Local              →  http://localhost:${PORT}`);
  console.log(`  Platform           →  ${process.platform}/${process.arch}`);
  console.log(`  Camera             →  ${camLine}`);
  console.log(`  Serving UI         →  ${fs.existsSync(DIST_DIR) ? "yes (dist/)" : "no (run npm run build)"}`);
  console.log(`  DB                 →  ${path.join(DATA_DIR, "booth.db")}\n`);
});

// Release the camera cleanly, otherwise the body can stay locked until it is
// power-cycled or unplugged.
let closing = false;
async function gracefulExit(signal) {
  if (closing) return;
  closing = true;
  if (edsdkMod) {
    try {
      await edsdkMod.shutdown();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
  if (signal) console.log(`\n  ${signal} — camera released, shutting down.`);
}
process.on("SIGINT", () => gracefulExit("SIGINT"));
process.on("SIGTERM", () => gracefulExit("SIGTERM"));
