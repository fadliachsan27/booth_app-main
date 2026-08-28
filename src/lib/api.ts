// Client for the local photobooth backend (server/index.cjs).
//
// Base URL resolution:
//   1. VITE_API_URL if set
//   2. same host the kiosk UI is served from, on port 4000

import type { BookkeepingEntry, FrameTemplate } from "@/types/kiosk";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

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
    }),
  );
}

export async function listPhotos(): Promise<SavedPhoto[]> {
  return j(await fetch(`${API_BASE}/api/photos`));
}

export async function clearPhotos(): Promise<void> {
  await j(await fetch(`${API_BASE}/api/photos`, { method: "DELETE" }));
}

/* ---------- config ---------- */

export async function getConfig(): Promise<BoothConfig> {
  return j(await fetch(`${API_BASE}/api/config`));
}

export async function saveConfig(patch: Partial<BoothConfig>): Promise<BoothConfig> {
  return j(
    await fetch(`${API_BASE}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

/* ---------- templates ---------- */

export async function listTemplates(): Promise<FrameTemplate[]> {
  return j(await fetch(`${API_BASE}/api/templates`));
}

/** Replace the whole template set (order preserved). */
export async function saveTemplates(templates: FrameTemplate[]): Promise<FrameTemplate[]> {
  return j(
    await fetch(`${API_BASE}/api/templates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templates),
    }),
  );
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
