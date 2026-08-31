// Photobooth local agent — runs on the booth PC, talks to Firestore.
//
// No server, no exposed port, no tunnel: this process only makes OUTBOUND
// connections to Firebase. It watches the "pb_jobs" collection for pending
// jobs (created by the kiosk UI, wherever it's hosted) and executes the ones
// that need real hardware: DSLR tethered capture, listing printers, printing.
//
// Run it:  node agent/index.cjs   (or double-click start-agent.bat)

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { initializeApp } = require("firebase/app");
const {
  getFirestore, collection, doc, getDoc, getDocs, query, where,
  onSnapshot, updateDoc, writeBatch,
} = require("firebase/firestore");

const firebaseConfig = require("../firebase.config.json");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const IS_WIN = process.platform === "win32";
const DATA_DIR = path.join(__dirname, "data");
const CAPTURE_DIR = path.join(DATA_DIR, "captures");
fs.mkdirSync(CAPTURE_DIR, { recursive: true });

/* ---------- chunked blob helpers (mirror src/lib/firestoreBlob.ts) ---------- */
const CHUNK_SIZE = 700_000;
function splitChunks(text) {
  const out = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) out.push(text.slice(i, i + CHUNK_SIZE));
  return out;
}
async function writeBlobDoc(collectionPath, id, meta, text) {
  const ref = doc(db, collectionPath, id);
  const chunksCol = collection(ref, "chunks");
  const existing = await getDocs(chunksCol);
  const chunks = splitChunks(text);
  const batch = writeBatch(db);
  for (const d of existing.docs) batch.delete(d.ref);
  chunks.forEach((c, i) => batch.set(doc(chunksCol, String(i)), { data: c }));
  batch.set(ref, { ...meta, chunkCount: chunks.length, updatedAt: Date.now() }, { merge: true });
  await batch.commit();
}
async function readBlobDoc(collectionPath, id) {
  const ref = doc(db, collectionPath, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const meta = snap.data();
  const n = Number(meta.chunkCount) || 0;
  const chunksCol = collection(ref, "chunks");
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => getDoc(doc(chunksCol, String(i)))),
  );
  return { meta, text: parts.map((p) => (p.exists() ? p.data().data : "")).join("") };
}

/* ---------- config ---------- */
const DEFAULT_CONFIG = {
  camera: { source: "webcam", dccUrl: "http://localhost:5513", gphoto2Bin: "gphoto2", countdown: 7 },
  printer: { enabled: false, autoPrint: false, name: "", copies: 1, command: "" },
};
async function loadConfig() {
  const snap = await getDoc(doc(db, "pb_config", "main"));
  const data = snap.exists() ? snap.data() : {};
  return {
    ...DEFAULT_CONFIG, ...data,
    camera: { ...DEFAULT_CONFIG.camera, ...(data.camera || {}) },
    printer: { ...DEFAULT_CONFIG.printer, ...(data.printer || {}) },
  };
}

/* ---------- shell helpers ---------- */
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
    if (st.mtimeMs >= sinceMs && (!best || st.mtimeMs > best.mtimeMs)) best = { path: path.join(dir, name), mtimeMs: st.mtimeMs };
  }
  return best;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- DSLR capture ---------- */
async function dccRequest(dccUrl, params) {
  const url = `${dccUrl.replace(/\/$/, "")}/?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`digiCamControl ${res.status}: ${text.slice(0, 200)}`);
  return text.trim();
}
async function captureDcc(cfg) {
  const dccUrl = cfg.camera.dccUrl || "http://localhost:5513";
  await dccRequest(dccUrl, { slc: "set", param1: "session.folder", param2: CAPTURE_DIR }).catch(() => {});
  await dccRequest(dccUrl, { slc: "set", param1: "session.filenametemplate", param2: "cap_[Date yyyy-MM-dd-HH-mm-ss]" }).catch(() => {});
  const started = Date.now() - 1000;
  try { await dccRequest(dccUrl, { slc: "capture", param1: "", param2: "" }); }
  catch { await dccRequest(dccUrl, { CMD: "Capture" }); }
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const f = newestFile(CAPTURE_DIR, started);
    if (f && Date.now() - f.mtimeMs > 300) return fs.readFileSync(f.path);
  }
  throw new Error("digiCamControl: tidak ada gambar terunduh (kamera terhubung? web server aktif?)");
}
async function captureGphoto2(cfg) {
  const bin = cfg.camera.gphoto2Bin || "gphoto2";
  const out = path.join(CAPTURE_DIR, `gp_${Date.now()}.jpg`);
  await run(bin, ["--capture-image-and-download", "--filename", out, "--force-overwrite"]);
  if (!fs.existsSync(out)) throw new Error("gphoto2: capture tidak menghasilkan file");
  return fs.readFileSync(out);
}

/* ---------- printing ---------- */
async function listPrinters() {
  try {
    if (IS_WIN) {
      const { stdout } = await run("powershell", ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]);
      return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    const { stdout } = await run("lpstat", ["-e"]);
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}
async function defaultPrinter() {
  if (!IS_WIN) return "";
  try {
    const { stdout } = await run("powershell", ["-NoProfile", "-Command", "(Get-CimInstance -Class Win32_Printer -Filter 'Default = True').Name"]);
    return stdout.trim();
  } catch { return ""; }
}
async function printFile(filePath, cfg) {
  const p = cfg.printer;
  const copies = Math.max(1, Number(p.copies) || 1);
  if (p.command && p.command.trim()) {
    const cmd = p.command.replaceAll("{file}", filePath).replaceAll("{printer}", p.name || "").replaceAll("{copies}", String(copies));
    const parts = cmd.match(/"[^"]+"|\S+/g).map((s) => s.replace(/^"|"$/g, ""));
    await run(parts[0], parts.slice(1));
    return;
  }
  if (IS_WIN) {
    const target = p.name || (await defaultPrinter());
    for (let i = 0; i < copies; i++) {
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

/* ---------- job processing ---------- */
async function completeJob(jobId, result) {
  await updateDoc(doc(db, "pb_jobs", jobId), { status: "done", result, updatedAt: Date.now() });
}
async function failJob(jobId, err) {
  await updateDoc(doc(db, "pb_jobs", jobId), { status: "error", error: String(err.message || err), updatedAt: Date.now() });
}

async function handleJob(jobId, data) {
  console.log(`[agent] job ${jobId} (${data.type})...`);
  try {
    const cfg = await loadConfig();
    switch (data.type) {
      case "status": {
        if (cfg.camera.source === "dslr-dcc") {
          try { const info = await dccRequest(cfg.camera.dccUrl, { slc: "get", param1: "camera.status" }); await completeJob(jobId, { reachable: true, info }); }
          catch (e) { await completeJob(jobId, { reachable: false, error: String(e.message || e) }); }
        } else if (cfg.camera.source === "dslr-gphoto2") {
          try { const { stdout } = await run(cfg.camera.gphoto2Bin || "gphoto2", ["--auto-detect"]); await completeJob(jobId, { reachable: /usb:/i.test(stdout), info: stdout.trim() }); }
          catch (e) { await completeJob(jobId, { reachable: false, error: String(e.message || e) }); }
        } else {
          await completeJob(jobId, { reachable: true });
        }
        break;
      }
      case "capture": {
        let buf;
        if (cfg.camera.source === "dslr-dcc") buf = await captureDcc(cfg);
        else if (cfg.camera.source === "dslr-gphoto2") buf = await captureGphoto2(cfg);
        else throw new Error("camera source di config ini 'webcam', bukan DSLR");
        await writeBlobDoc("pb_jobs", jobId, {}, `data:image/jpeg;base64,${buf.toString("base64")}`);
        await completeJob(jobId, { chunked: true });
        break;
      }
      case "printers": {
        await completeJob(jobId, { printers: await listPrinters() });
        break;
      }
      case "print": {
        const photoId = data.payload && data.payload.photoId;
        const blob = photoId ? await readBlobDoc("pb_photos", photoId) : null;
        if (!blob || !blob.text) throw new Error("foto tidak ditemukan");
        const base64 = blob.text.includes(",") ? blob.text.slice(blob.text.indexOf(",") + 1) : blob.text;
        const tmp = path.join(CAPTURE_DIR, `print_${jobId}.jpg`);
        fs.writeFileSync(tmp, Buffer.from(base64, "base64"));
        await printFile(tmp, cfg);
        await completeJob(jobId, { ok: true });
        break;
      }
      default:
        throw new Error("job type tidak dikenal: " + data.type);
    }
    console.log(`[agent] job ${jobId} selesai`);
  } catch (e) {
    console.error(`[agent] job ${jobId} gagal:`, e.message || e);
    await failJob(jobId, e).catch(() => {});
  }
}

/* ---------- listen for pending jobs ---------- */
const seen = new Set();
const pendingQuery = query(collection(db, "pb_jobs"), where("status", "==", "pending"));
onSnapshot(
  pendingQuery,
  (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === "removed") continue;
      const id = change.doc.id;
      if (seen.has(id)) continue;
      seen.add(id);
      handleJob(id, change.doc.data());
    }
  },
  (err) => console.error("[agent] listener error:", err.message || err),
);

console.log("\n  Photobooth agent berjalan.");
console.log(`  Project Firebase   -> ${firebaseConfig.projectId}`);
console.log("  Mendengarkan perintah DSLR / printer dari Firestore (pb_jobs)...\n");
