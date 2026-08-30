// Canon EDSDK (EOS Digital SDK) 13.20.10 — tethered capture + live view.
//
// Talks to EDSDK.dll / libEDSDK.so directly through koffi (FFI), so there is no
// native build step and no extra helper app like digiCamControl. Camera must be
// connected by USB to the machine running this server.
//
// Threading: the EDSDK requires every call to happen on one thread and expects
// that thread to pump EdsGetEvent(). We do both on the Node main thread and
// serialise all public calls through a small promise queue.
//
// Public API (all async, all safe to call repeatedly):
//   isAvailable()      -> { ok, reason }
//   status()           -> { reachable, info, error }
//   capture()          -> Buffer (JPEG bytes as downloaded from the camera)
//   liveViewFrame()    -> Buffer | null   (null = live view not ready yet)
//   stopLiveView()
//   shutdown()

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { edsErrorName } = require("./errors.cjs");

/* ---------- constants (from EDSDKTypes.h / EDSDKErrors.h) ---------- */

const EDS_ERR_OK = 0x00000000;
const EDS_ERR_DEVICE_BUSY = 0x00000081;
const EDS_ERR_OBJECT_NOTREADY = 0x0000a102;
const EDS_ERR_TAKE_PICTURE_AF_NG = 0x00008d01;

const kEdsPropID_ProductName = 0x00000002;
const kEdsPropID_SaveTo = 0x0000000b;
const kEdsPropID_Evf_OutputDevice = 0x00000500;

const kEdsSaveTo_Host = 2;
const kEdsEvfOutputDevice_Off = 0;
const kEdsEvfOutputDevice_PC = 2;

const kEdsCameraCommand_TakePicture = 0x00000000;
const kEdsCameraCommand_PressShutterButton = 0x00000004;
const kEdsCameraCommand_ShutterButton_OFF = 0x00000000;
const kEdsCameraCommand_ShutterButton_Completely = 0x00000003;
const kEdsCameraCommand_ShutterButton_Completely_NonAF = 0x00010003;

const kEdsObjectEvent_All = 0x00000200;
const kEdsObjectEvent_DirItemRequestTransfer = 0x00000208;
const kEdsObjectEvent_DirItemRequestTransferDT = 0x00000209;

// Errors that mean "the link to the camera is gone" — drop the session and
// reconnect on the next call instead of failing forever.
const FATAL_LINK_ERRORS = new Set([
  0x00000080, // DEVICE_NOT_FOUND
  0x00000083, // DEVICE_INVALID
  0x000000a1, // COMM_DISCONNECTED  (comm port errors)
  0x00002003, // SESSION_NOT_OPEN
  0x00002008, // DEVICE_NOT_INSTALLED
]);

const EVF_IDLE_MS = 6000; // stop live view after this long with no frame request

/* ---------- library resolution ---------- */

const VENDOR_DIR = path.join(__dirname, "vendor");

function defaultLibPath() {
  const { platform, arch } = process;
  if (platform === "win32") {
    return path.join(VENDOR_DIR, "win-x64", "EDSDK.dll");
  }
  if (platform === "linux") {
    const dir = arch === "arm64" ? "linux-arm64" : arch === "arm" ? "linux-arm32" : "linux-x64";
    return path.join(VENDOR_DIR, dir, "libEDSDK.so");
  }
  if (platform === "darwin") {
    // The macOS SDK ships as a .framework inside Macintosh.dmg — unpack it to
    // vendor/macos/EDSDK.framework and point EDSDK_LIB at the binary inside.
    return path.join(VENDOR_DIR, "macos", "EDSDK.framework", "EDSDK");
  }
  return "";
}

function resolveLibPath(override) {
  const p = (override || process.env.EDSDK_LIB || "").trim();
  return p ? path.resolve(p) : defaultLibPath();
}

/* ---------- state ---------- */

const state = {
  lib: null, // koffi function table
  libPath: "",
  sdkInit: false,
  camera: null, // EdsCameraRef
  cameraName: "",
  handlerPtr: null,
  pumpTimer: null,
  evfOn: false,
  evfLastUse: 0,
  pending: [], // EdsDirectoryItemRefs waiting to be downloaded
  chain: Promise.resolve(),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** uint64 out-params come back as BigInt or Number depending on the value. */
const num = (v) => (typeof v === "bigint" ? Number(v) : Number(v || 0));

class EdsError extends Error {
  constructor(message, code) {
    super(code === undefined ? message : `${message} (${edsErrorName(code)})`);
    this.name = "EdsError";
    this.code = code;
  }
}

function check(code, what) {
  const c = code >>> 0;
  if (c !== EDS_ERR_OK) {
    if (FATAL_LINK_ERRORS.has(c)) dropCamera();
    throw new EdsError(what || "EDSDK call failed", c);
  }
}

/* ---------- binding ---------- */

function loadLibrary(override) {
  const wanted = resolveLibPath(override);
  if (state.lib && state.libPath === wanted) return state.lib;
  if (state.lib && state.libPath !== wanted) {
    throw new Error(
      `EDSDK already loaded from ${state.libPath}; restart the server to switch library path`,
    );
  }

  if (process.arch === "ia32") {
    throw new Error("32-bit Node is not supported — run 64-bit Node with the 64-bit EDSDK");
  }
  if (!wanted) throw new Error(`unsupported platform for EDSDK: ${process.platform}/${process.arch}`);
  if (!fs.existsSync(wanted)) {
    throw new Error(
      `EDSDK library not found at ${wanted}. Copy the SDK binaries into server/edsdk/vendor/ ` +
        `(see server/edsdk/README.md), or set EDSDK_LIB to the full path.`,
    );
  }

  let koffi;
  try {
    koffi = require("koffi");
  } catch {
    throw new Error("koffi is not installed — run: npm install");
  }

  // EDSDK.dll loads EdsImage.dll / IHL\*.dll from the OS search path at runtime.
  if (process.platform === "win32") {
    const dir = path.dirname(wanted);
    if (!process.env.PATH.split(path.delimiter).includes(dir)) {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
    }
  }

  const dll = koffi.load(wanted);

  // EdsChar is plain `char`; EdsBool is `int`; EdsUInt64 is 64-bit.
  const EdsDirectoryItemInfo = koffi.struct("EdsDirectoryItemInfo", {
    size: "uint64",
    isFolder: "int32",
    groupID: "uint32",
    option: "uint32",
    szFileName: koffi.array("char", 256, "String"),
    format: "uint32",
    dateTime: "uint32",
  });
  const EdsCapacity = koffi.struct("EdsCapacity", {
    numberOfFreeClusters: "int32",
    bytesPerSector: "int32",
    reset: "int32",
  });
  const EdsObjectEventHandler = koffi.proto(
    "uint32 EdsObjectEventHandler(uint32 inEvent, void *inRef, void *inContext)",
  );

  const lib = {
    koffi,
    EdsObjectEventHandler,
    InitializeSDK: dll.func("uint32 EdsInitializeSDK()"),
    TerminateSDK: dll.func("uint32 EdsTerminateSDK()"),
    Release: dll.func("uint32 EdsRelease(void *inRef)"),
    GetEvent: dll.func("uint32 EdsGetEvent()"),
    GetCameraList: dll.func("uint32 EdsGetCameraList(_Out_ void **outCameraListRef)"),
    GetChildCount: dll.func("uint32 EdsGetChildCount(void *inRef, _Out_ uint32 *outCount)"),
    GetChildAtIndex: dll.func("uint32 EdsGetChildAtIndex(void *inRef, int32 inIndex, _Out_ void **outRef)"),
    OpenSession: dll.func("uint32 EdsOpenSession(void *inCameraRef)"),
    CloseSession: dll.func("uint32 EdsCloseSession(void *inCameraRef)"),
    GetPropertyData: dll.func(
      "uint32 EdsGetPropertyData(void *inRef, uint32 inPropertyID, int32 inParam, uint32 inPropertySize, void *outPropertyData)",
    ),
    SetPropertyData: dll.func(
      "uint32 EdsSetPropertyData(void *inRef, uint32 inPropertyID, int32 inParam, uint32 inPropertySize, void *inPropertyData)",
    ),
    SetCapacity: dll.func("uint32 EdsSetCapacity(void *inCameraRef, EdsCapacity inCapacity)"),
    SendCommand: dll.func("uint32 EdsSendCommand(void *inCameraRef, uint32 inCommand, int32 inParam)"),
    SetObjectEventHandler: dll.func(
      "uint32 EdsSetObjectEventHandler(void *inCameraRef, uint32 inEvent, EdsObjectEventHandler *inHandler, void *inContext)",
    ),
    GetDirectoryItemInfo: dll.func(
      "uint32 EdsGetDirectoryItemInfo(void *inDirItemRef, _Out_ EdsDirectoryItemInfo *outDirItemInfo)",
    ),
    Download: dll.func("uint32 EdsDownload(void *inDirItemRef, uint64 inReadSize, void *outStream)"),
    DownloadComplete: dll.func("uint32 EdsDownloadComplete(void *inDirItemRef)"),
    DownloadCancel: dll.func("uint32 EdsDownloadCancel(void *inDirItemRef)"),
    CreateMemoryStream: dll.func("uint32 EdsCreateMemoryStream(uint64 inBufferSize, _Out_ void **outStream)"),
    GetPointer: dll.func("uint32 EdsGetPointer(void *inStream, _Out_ void **outPointer)"),
    GetLength: dll.func("uint32 EdsGetLength(void *inStreamRef, _Out_ uint64 *outLength)"),
    CreateEvfImageRef: dll.func("uint32 EdsCreateEvfImageRef(void *inStreamRef, _Out_ void **outEvfImageRef)"),
    DownloadEvfImage: dll.func("uint32 EdsDownloadEvfImage(void *inCameraRef, void *inEvfImageRef)"),
  };

  state.lib = lib;
  state.libPath = wanted;
  return lib;
}

/* ---------- session ---------- */

function startPump() {
  if (state.pumpTimer) return;
  // EdsGetEvent() is what actually delivers object/state events on a non-UI app.
  state.pumpTimer = setInterval(() => {
    try {
      state.lib.GetEvent();
    } catch {
      /* ignore — surfaced by the next real call */
    }
    if (state.evfOn && Date.now() - state.evfLastUse > EVF_IDLE_MS) {
      try {
        setPropU32(state.camera, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_Off);
      } catch {
        /* ignore */
      }
      state.evfOn = false;
    }
  }, 50);
  state.pumpTimer.unref?.();
}

function setPropU32(ref, propId, value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return state.lib.SetPropertyData(ref, propId, 0, 4, buf) >>> 0;
}

function getPropString(ref, propId, size = 256) {
  const buf = Buffer.alloc(size);
  const err = state.lib.GetPropertyData(ref, propId, 0, size, buf) >>> 0;
  if (err !== EDS_ERR_OK) return "";
  const end = buf.indexOf(0);
  return buf.toString("utf8", 0, end === -1 ? size : end).trim();
}

function ensureSdk(override) {
  loadLibrary(override);
  if (state.sdkInit) return;
  check(state.lib.InitializeSDK(), "EdsInitializeSDK");
  state.sdkInit = true;
  startPump();
}

function dropCamera() {
  if (!state.lib) return;
  const cam = state.camera;
  state.camera = null;
  state.cameraName = "";
  state.evfOn = false;
  state.pending.length = 0;
  if (cam) {
    try {
      state.lib.CloseSession(cam);
    } catch {
      /* ignore */
    }
    try {
      state.lib.Release(cam);
    } catch {
      /* ignore */
    }
  }
}

function openCamera() {
  if (state.camera) return state.camera;

  const outList = [null];
  check(state.lib.GetCameraList(outList), "EdsGetCameraList");
  const list = outList[0];
  let cam = null;
  try {
    const outCount = [0];
    check(state.lib.GetChildCount(list, outCount), "EdsGetChildCount");
    if (!outCount[0]) {
      throw new Error(
        "no Canon camera detected — check the USB cable, turn the camera on, and make sure no other app (EOS Utility, digiCamControl) is holding it",
      );
    }
    const outCam = [null];
    check(state.lib.GetChildAtIndex(list, 0, outCam), "EdsGetChildAtIndex");
    cam = outCam[0];
    check(state.lib.OpenSession(cam), "EdsOpenSession");
  } finally {
    try {
      state.lib.Release(list);
    } catch {
      /* ignore */
    }
  }

  // Keep images on the host: nothing is written to the camera's card.
  check(setPropU32(cam, kEdsPropID_SaveTo, kEdsSaveTo_Host), "set SaveTo=Host");
  // Required after SaveTo=Host, otherwise the camera refuses to release.
  check(
    state.lib.SetCapacity(cam, { numberOfFreeClusters: 0x7fffffff, bytesPerSector: 0x1000, reset: 1 }),
    "EdsSetCapacity",
  );

  if (!state.handlerPtr) {
    state.handlerPtr = state.lib.koffi.register((event, ref) => {
      const ev = event >>> 0;
      if (ev === kEdsObjectEvent_DirItemRequestTransfer || ev === kEdsObjectEvent_DirItemRequestTransferDT) {
        state.pending.push(ref); // released after download
      } else if (ref) {
        try {
          state.lib.Release(ref);
        } catch {
          /* ignore */
        }
      }
      return EDS_ERR_OK;
    }, state.lib.koffi.pointer(state.lib.EdsObjectEventHandler));
  }
  check(
    state.lib.SetObjectEventHandler(cam, kEdsObjectEvent_All, state.handlerPtr, null),
    "EdsSetObjectEventHandler",
  );

  state.camera = cam;
  state.cameraName = getPropString(cam, kEdsPropID_ProductName) || "Canon EOS";
  return cam;
}

/** Serialise every public call — the SDK is not re-entrant. */
function queue(fn) {
  const run = state.chain.then(fn, fn);
  state.chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

/* ---------- capture ---------- */

function pressShutter(cam, nonAf) {
  const mode = nonAf ? kEdsCameraCommand_ShutterButton_Completely_NonAF : kEdsCameraCommand_ShutterButton_Completely;
  const err = state.lib.SendCommand(cam, kEdsCameraCommand_PressShutterButton, mode) >>> 0;
  // Always release the "button", even when the press failed.
  try {
    state.lib.SendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
  } catch {
    /* ignore */
  }
  return err;
}

function triggerShot(cam) {
  let err = pressShutter(cam, false);
  if (err === EDS_ERR_TAKE_PICTURE_AF_NG) err = pressShutter(cam, true); // AF could not lock — shoot anyway
  if (err === EDS_ERR_OK) return;

  // Some bodies (and some modes) only respond to the plain TakePicture command.
  const fallback = state.lib.SendCommand(cam, kEdsCameraCommand_TakePicture, 0) >>> 0;
  if (fallback !== EDS_ERR_OK) check(err, "shutter release failed");
}

async function waitForItem(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.pending.length) return state.pending.shift();
    try {
      state.lib.GetEvent();
    } catch {
      /* ignore */
    }
    await sleep(30);
  }
  return null;
}

function streamToBuffer(stream) {
  const outPtr = [null];
  check(state.lib.GetPointer(stream, outPtr), "EdsGetPointer");
  const outLen = [0];
  check(state.lib.GetLength(stream, outLen), "EdsGetLength");
  const len = num(outLen[0]);
  if (!len || !outPtr[0]) return Buffer.alloc(0);
  // koffi.view maps native memory without copying — copy it out before the
  // stream is released.
  return Buffer.from(new Uint8Array(state.lib.koffi.view(outPtr[0], len)));
}

function downloadItem(dirItem) {
  const outInfo = [{}];
  check(state.lib.GetDirectoryItemInfo(dirItem, outInfo), "EdsGetDirectoryItemInfo");
  const info = outInfo[0];
  const size = num(info.size);

  const outStream = [null];
  check(state.lib.CreateMemoryStream(size || 1, outStream), "EdsCreateMemoryStream");
  const stream = outStream[0];
  try {
    check(state.lib.Download(dirItem, size, stream), "EdsDownload");
    check(state.lib.DownloadComplete(dirItem), "EdsDownloadComplete");
    return { buffer: streamToBuffer(stream), filename: info.szFileName || "capture.jpg" };
  } catch (err) {
    try {
      state.lib.DownloadCancel(dirItem);
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    try {
      state.lib.Release(stream);
    } catch {
      /* ignore */
    }
    try {
      state.lib.Release(dirItem);
    } catch {
      /* ignore */
    }
  }
}

/* ---------- public API ---------- */

function isAvailable(opts = {}) {
  try {
    require.resolve("koffi");
  } catch {
    return { ok: false, reason: "koffi is not installed — run npm install" };
  }
  const p = resolveLibPath(opts.libPath);
  if (!p) return { ok: false, reason: `unsupported platform: ${process.platform}/${process.arch}` };
  if (!fs.existsSync(p)) return { ok: false, reason: `EDSDK library not found at ${p}` };
  return { ok: true, reason: "", libPath: p };
}

async function status(opts = {}) {
  return queue(async () => {
    try {
      ensureSdk(opts.libPath);
      const cam = openCamera();
      const name = state.cameraName || getPropString(cam, kEdsPropID_ProductName);
      return {
        reachable: true,
        info: [`${name}`, `EDSDK: ${state.libPath}`, "SaveTo: Host (nothing written to the card)"].join("\n"),
      };
    } catch (err) {
      return { reachable: false, error: String(err.message || err) };
    }
  });
}

/**
 * Take one photo and return its JPEG bytes.
 * Live view is suspended for the shot and resumed afterwards if it was running.
 */
async function capture(opts = {}) {
  return queue(async () => {
    ensureSdk(opts.libPath);
    const cam = openCamera();

    const hadEvf = state.evfOn;
    state.pending.length = 0;

    try {
      triggerShot(cam);
    } catch (err) {
      // A live view session can block the shutter on some bodies — retry once
      // with live view switched off.
      if (!hadEvf) throw err;
      setPropU32(cam, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_Off);
      state.evfOn = false;
      await sleep(400);
      triggerShot(cam);
    }

    const timeout = Number(opts.timeoutMs) || 20000;
    const dirItem = await waitForItem(timeout);
    if (!dirItem) {
      throw new Error(
        `camera did not deliver an image within ${Math.round(timeout / 1000)}s — check the lens is not in MF-blocked AF, the card/mode dial, and that the body is not in movie mode`,
      );
    }
    const { buffer, filename } = downloadItem(dirItem);
    if (!buffer.length) throw new Error("EDSDK returned an empty image");

    if (hadEvf && !state.evfOn) {
      try {
        setPropU32(cam, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_PC);
        state.evfOn = true;
        state.evfLastUse = Date.now();
      } catch {
        /* ignore */
      }
    }
    return { buffer, filename };
  });
}

/** One live view frame as JPEG bytes, or null while the camera is still warming up. */
async function liveViewFrame(opts = {}) {
  return queue(async () => {
    ensureSdk(opts.libPath);
    const cam = openCamera();
    state.evfLastUse = Date.now();

    if (!state.evfOn) {
      check(setPropU32(cam, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_PC), "start live view");
      state.evfOn = true;
      await sleep(300); // the mirror needs a moment before the first frame
    }

    const outStream = [null];
    check(state.lib.CreateMemoryStream(0, outStream), "EdsCreateMemoryStream");
    const stream = outStream[0];
    const outEvf = [null];
    let evf = null;
    try {
      check(state.lib.CreateEvfImageRef(stream, outEvf), "EdsCreateEvfImageRef");
      evf = outEvf[0];
      const err = state.lib.DownloadEvfImage(cam, evf) >>> 0;
      if (err === EDS_ERR_OBJECT_NOTREADY || err === EDS_ERR_DEVICE_BUSY) return null;
      check(err, "EdsDownloadEvfImage");
      const buf = streamToBuffer(stream);
      return buf.length ? buf : null;
    } finally {
      if (evf) {
        try {
          state.lib.Release(evf);
        } catch {
          /* ignore */
        }
      }
      try {
        state.lib.Release(stream);
      } catch {
        /* ignore */
      }
    }
  });
}

async function stopLiveView() {
  return queue(async () => {
    if (!state.camera || !state.evfOn) return;
    try {
      setPropU32(state.camera, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_Off);
    } catch {
      /* ignore */
    }
    state.evfOn = false;
  });
}

async function shutdown() {
  return queue(async () => {
    if (state.camera && state.evfOn) {
      try {
        setPropU32(state.camera, kEdsPropID_Evf_OutputDevice, kEdsEvfOutputDevice_Off);
      } catch {
        /* ignore */
      }
    }
    dropCamera();
    if (state.pumpTimer) {
      clearInterval(state.pumpTimer);
      state.pumpTimer = null;
    }
    if (state.sdkInit && state.lib) {
      try {
        state.lib.TerminateSDK();
      } catch {
        /* ignore */
      }
      state.sdkInit = false;
    }
  });
}

module.exports = {
  isAvailable,
  status,
  capture,
  liveViewFrame,
  stopLiveView,
  shutdown,
  resolveLibPath,
  defaultLibPath,
  vendorDir: VENDOR_DIR,
};
