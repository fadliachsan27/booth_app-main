#!/usr/bin/env node
// Canon EDSDK self-test — run this on the booth PC with the camera plugged in,
// BEFORE fighting with the kiosk UI. It isolates the camera from everything
// else (Express, SQLite, the browser) so a failure points straight at the
// camera, the cable, or the SDK.
//
//   node scripts/edsdk-check.cjs            connect + report what it found
//   node scripts/edsdk-check.cjs --shot     also take one real photo
//   node scripts/edsdk-check.cjs --liveview also grab one live view frame
//   node scripts/edsdk-check.cjs --all      do all of the above
//
// Anything it writes lands in server/data/edsdk-check/.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = new Set(process.argv.slice(2));
const wantAll = args.has("--all");
const wantShot = wantAll || args.has("--shot");
const wantLive = wantAll || args.has("--liveview");

const OUT_DIR = path.join(__dirname, "..", "server", "data", "edsdk-check");

const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const bad = (m) => console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
const info = (m) => console.log(`        ${m}`);
const head = (m) => console.log(`\n${m}`);

async function main() {
  head("Canon EDSDK self-test");
  info(`Node      ${process.version} (${process.arch})`);
  info(`Platform  ${process.platform}`);

  if (process.arch === "ia32") {
    bad("32-bit Node. The bundled EDSDK is 64-bit — install 64-bit Node and retry.");
    process.exit(1);
  }

  let eds;
  try {
    eds = require("../server/edsdk/index.cjs");
  } catch (err) {
    bad(`cannot load the EDSDK module: ${err.message}`);
    info("Run `npm install` in the project folder first.");
    process.exit(1);
  }

  head("1. SDK files");
  const avail = eds.isAvailable();
  if (!avail.ok) {
    bad(avail.reason);
    info(`Expected library at: ${eds.defaultLibPath()}`);
    info("Copy the SDK binaries into server/edsdk/vendor/ — see server/edsdk/README.md");
    process.exit(1);
  }
  ok(`library found: ${avail.libPath}`);

  head("2. Camera connection");
  const st = await eds.status();
  if (!st.reachable) {
    bad(st.error);
    info("Checklist:");
    info("  • camera switched ON, battery charged (or on AC)");
    info("  • USB cable is a DATA cable, plugged into the camera's USB port");
    info("  • EOS Utility / digiCamControl / Lightroom fully CLOSED (incl. tray icons)");
    info("  • mode dial on M / Av / Tv — not the movie position");
    await eds.shutdown();
    process.exit(1);
  }
  ok("session open");
  for (const line of String(st.info || "").split("\n")) if (line) info(line);

  if (wantShot) {
    head("3. Test photo");
    try {
      const t0 = Date.now();
      const { buffer, filename } = await eds.capture();
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const dest = path.join(OUT_DIR, `shot_${Date.now()}_${filename.replace(/[^\w.-]/g, "_")}`);
      fs.writeFileSync(dest, buffer);
      ok(`captured ${(buffer.length / 1024 / 1024).toFixed(2)} MB in ${Date.now() - t0} ms`);
      info(`saved to ${dest}`);
      if (buffer.slice(0, 2).toString("hex") !== "ffd8") {
        info("NOTE: this is not a JPEG. The camera is probably set to RAW —");
        info("switch image quality to JPEG (or RAW+JPEG) so the booth can use it.");
      }
    } catch (err) {
      bad(err.message);
      info("If it mentions AF: the lens could not focus. Try more light, or");
      info("switch the lens to MF and pre-focus on where people will stand.");
    }
  }

  if (wantLive) {
    head(`${wantShot ? "4" : "3"}. Live view`);
    try {
      let frame = null;
      for (let i = 0; i < 20 && !frame; i++) {
        frame = await eds.liveViewFrame();
        if (!frame) await new Promise((r) => setTimeout(r, 250));
      }
      if (!frame) {
        bad("no live view frame after 5s");
        info("Some bodies need live view enabled in the camera menu first.");
      } else {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        const dest = path.join(OUT_DIR, `liveview_${Date.now()}.jpg`);
        fs.writeFileSync(dest, frame);
        ok(`frame received (${(frame.length / 1024).toFixed(0)} KB)`);
        info(`saved to ${dest}`);
      }
      await eds.stopLiveView();
    } catch (err) {
      bad(err.message);
    }
  }

  head("Done — releasing the camera.");
  await eds.shutdown();
  process.exit(0);
}

main().catch(async (err) => {
  bad(`unexpected: ${err.stack || err.message}`);
  process.exit(1);
});
