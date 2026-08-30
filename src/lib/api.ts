// Client for the local photobooth backend (server/index.cjs).
//
// Base URL resolution:
//   1. VITE_API_URL if set
//   2. same host the kiosk UI is served from, on port 4000

import type { BookkeepingEntry, FrameTemplate } from "@/types/kiosk";

// Local dev runs Vite on :5173 and the API on :4000. Everywhere else (a
// single-service deploy, or `npm start` serving dist/) the API is same-origin.
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  (window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : window.location.origin);

export interface SavedPhoto extends BookkeepingEntry {
  downloadUrl: string;
  fileUrl: string;
}

export type CameraSource = "webcam" | "dslr-dcc" | "dslr-gphoto2";

export interface BoothConfig {
  camera: {
    source: CameraSource;
    dccUrl: string;
    gphoto2Bin: string;
    countdown: number;
  };
  printer: {
    enabled: boolean;
    autoPrint: boolean;
    name: string;
    copies: number;
    command: string;
  };
  pricing: { sessionPrice: number };
  payment: {
    enabled: boolean;
    // "cash" is always available; QRIS shows when an image/payload is set
    qrisImage: string;
    qrisPayload: string;
    note: string;
  };
}

export const DEFAULT_CONFIG: BoothConfig = {
  camera: { source: "webcam", dccUrl: "http://localhost:5513", gphoto2Bin: "gphoto2", countdown: 7 },
  printer: { enabled: false, autoPrint: false, name: "", copies: 1, command: "" },
  pricing: { sessionPrice: 25000 },
  payment: { enabled: false, qrisImage: "", qrisPayload: "", note: "" },
};

/** Whether the last server call succeeded. Updated on every request. */
export let serverOnline = true;

const LS_CONFIG = "booth.config";
const LS_TEMPLATES = "booth.templates";
const lsGet = <T,>(k: string): T | null => {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ } };

function mergeConfig(base: BoothConfig, patch: Partial<BoothConfig>): BoothConfig {
  return {
    ...base, ...patch,
    camera: { ...base.camera, ...(patch.camera || {}) },
    printer: { ...base.printer, ...(patch.printer || {}) },
    pricing: { ...base.pricing, ...(patch.pricing || {}) },
    payment: { ...base.payment, ...(patch.payment || {}) },
  };
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(6000), ...init });
    serverOnline = true;
    return res;
  } catch (e) {
    serverOnline = false;
    throw e;
  }
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

/* ---------- photos ---------- */

export async function uploadPhoto(
  imageBase64: string,
  meta: { templateId: string; templateName: string; price: number },
): Promise<SavedPhoto> {
  return j(
    await fetch(`${API_BASE}/api/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, ...meta }),
      // Bounded wait — no backend (e.g. static hosting with no server) must
      // fail fast instead of hanging the "Menyiapkan link download..." spinner.
      signal: AbortSignal.timeout(10000),
    }),
  );
}

export async function listPhotos(): Promise<SavedPhoto[]> {
  return j(await fetch(`${API_BASE}/api/photos`));
}

export async function clearPhotos(): Promise<void> {
  await j(await fetch(`${API_BASE}/api/photos`, { method: "DELETE" }));
}

/* ---------- config ----------
 * Server is the source of truth; localStorage is a per-device fallback so the
 * operator's settings survive when the backend isn't reachable (e.g. the UI is
 * opened without the local server running). */

export async function getConfig(): Promise<BoothConfig> {
  try {
    const c = await j<BoothConfig>(await req("/api/config"));
    lsSet(LS_CONFIG, c);
    return c;
  } catch {
    return lsGet<BoothConfig>(LS_CONFIG) ?? { ...DEFAULT_CONFIG };
  }
}

/** Save a config patch. `synced` = whether it reached the server. */
export async function saveConfig(patch: Partial<BoothConfig>): Promise<{ config: BoothConfig; synced: boolean }> {
  const current = lsGet<BoothConfig>(LS_CONFIG) ?? { ...DEFAULT_CONFIG };
  const optimistic = mergeConfig(current, patch);
  lsSet(LS_CONFIG, optimistic);
  try {
    const c = await j<BoothConfig>(
      await req("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
    lsSet(LS_CONFIG, c);
    return { config: c, synced: true };
  } catch {
    return { config: optimistic, synced: false };
  }
}

/* ---------- templates ---------- */

export async function listTemplates(): Promise<FrameTemplate[]> {
  try {
    const t = await j<FrameTemplate[]>(await req("/api/templates"));
    if (t.length > 0) lsSet(LS_TEMPLATES, t);
    return t;
  } catch {
    return lsGet<FrameTemplate[]>(LS_TEMPLATES) ?? [];
  }
}

/** Replace the whole template set (order preserved). Falls back to localStorage. */
export async function saveTemplates(templates: FrameTemplate[]): Promise<{ templates: FrameTemplate[]; synced: boolean }> {
  lsSet(LS_TEMPLATES, templates);
  try {
    const t = await j<FrameTemplate[]>(
      await req("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templates),
      }),
    );
    lsSet(LS_TEMPLATES, t);
    return { templates: t, synced: true };
  } catch {
    return { templates, synced: false };
  }
}

/* ---------- camera ---------- */

export interface CameraStatus {
  source: CameraSource;
  reachable: boolean;
  info?: string;
  error?: string;
}

export async function cameraStatus(): Promise<CameraStatus> {
  return j(await fetch(`${API_BASE}/api/camera/status`));
}

/** Trigger one DSLR tethered capture. Returns a data-URL JPEG. */
export async function dslrCapture(): Promise<string> {
  const r = await j<{ imageBase64: string }>(
    await fetch(`${API_BASE}/api/capture`, { method: "POST" }),
  );
  return r.imageBase64;
}

export function liveviewUrl(): string {
  return `${API_BASE}/api/liveview.jpg?t=`;
}

/* ---------- printing ---------- */

export async function listPrinters(): Promise<string[]> {
  const r = await j<{ printers: string[] }>(await fetch(`${API_BASE}/api/printers`));
  return r.printers;
}

export async function printPhoto(id: string): Promise<void> {
  await j(
    await fetch(`${API_BASE}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  );
}
