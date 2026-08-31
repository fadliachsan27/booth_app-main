// Client for the photobooth's data layer — Firebase Firestore.
//
// No backend server: the kiosk (wherever it's hosted — Netlify, localhost, …)
// talks to Firestore directly. DSLR capture / printer listing / printing are
// things only the booth PC can physically do, so those go through a small
// job queue ("pb_jobs") that agent/index.cjs — running on the booth PC —
// picks up and executes, writing the result back to Firestore. No server, no
// exposed port, no tunnel: the agent only needs outbound internet.

import type { BookkeepingEntry, FrameTemplate } from "@/types/kiosk";
import { db } from "./firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, query, orderBy, onSnapshot, addDoc,
} from "firebase/firestore";
import { writeBlobDoc, readBlobDoc, deleteBlobDoc } from "./firestoreBlob";

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

/** Whether the last Firestore call succeeded. Updated on every request. */
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

function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Waktu koneksi habis")), ms)),
  ]);
}

function photoUrl(id: string): string {
  return `${window.location.origin}/d/${id}`;
}

/* ---------- photos ---------- */

const PHOTOS_COL = "pb_photos";

export async function uploadPhoto(
  imageBase64: string,
  meta: { templateId: string; templateName: string; price: number },
): Promise<SavedPhoto> {
  try {
    const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 16);
    const createdAt = Date.now();
    const date = new Date(createdAt).toISOString().split("T")[0];
    const price = Math.round(Number(meta.price)) || 0;
    await withTimeout(
      writeBlobDoc(db, PHOTOS_COL, id, {
        templateId: meta.templateId, templateName: meta.templateName, price, timestamp: createdAt, date,
      }, imageBase64),
      20000, // photo uploads are bigger — give them more time
    );
    serverOnline = true;

    // Optional auto-print — fire and forget, doesn't block the kiosk flow.
    getConfig().then((cfg) => {
      if (cfg.printer.enabled && cfg.printer.autoPrint) createJob("print", { photoId: id }).catch(() => {});
    }).catch(() => {});

    const url = photoUrl(id);
    return { id, templateId: meta.templateId, templateName: meta.templateName, price, timestamp: createdAt, date, downloadUrl: url, fileUrl: url };
  } catch (e) {
    serverOnline = false;
    throw e;
  }
}

export async function listPhotos(): Promise<SavedPhoto[]> {
  try {
    const snaps = await withTimeout(getDocs(query(collection(db, PHOTOS_COL), orderBy("timestamp", "desc"))));
    serverOnline = true;
    return snaps.docs.map((d) => {
      const m = d.data() as Record<string, unknown>;
      const url = photoUrl(d.id);
      return {
        id: d.id,
        templateId: String(m.templateId ?? ""),
        templateName: String(m.templateName ?? ""),
        price: Number(m.price) || 0,
        timestamp: Number(m.timestamp) || 0,
        date: String(m.date ?? ""),
        downloadUrl: url,
        fileUrl: url,
      };
    });
  } catch {
    serverOnline = false;
    return [];
  }
}

export async function clearPhotos(): Promise<void> {
  try {
    const snaps = await withTimeout(getDocs(collection(db, PHOTOS_COL)));
    await Promise.all(snaps.docs.map((d) => deleteBlobDoc(db, PHOTOS_COL, d.id)));
    serverOnline = true;
  } catch (e) {
    serverOnline = false;
    throw e;
  }
}

/** Full image + metadata for the /d/:id download page. */
export async function getPhotoImage(id: string): Promise<{ dataUrl: string; templateName: string } | null> {
  const blob = await readBlobDoc(db, PHOTOS_COL, id);
  if (!blob || !blob.text) return null;
  return { dataUrl: blob.text, templateName: String(blob.meta.templateName ?? "") };
}

/* ---------- config ----------
 * Firestore is the source of truth; localStorage is a per-device fallback so
 * the operator's settings survive when there's no connection. */

export async function getConfig(): Promise<BoothConfig> {
  try {
    const snap = await withTimeout(getDoc(doc(db, "pb_config", "main")));
    serverOnline = true;
    const c = snap.exists() ? mergeConfig(DEFAULT_CONFIG, snap.data() as Partial<BoothConfig>) : { ...DEFAULT_CONFIG };
    lsSet(LS_CONFIG, c);
    return c;
  } catch {
    serverOnline = false;
    return lsGet<BoothConfig>(LS_CONFIG) ?? { ...DEFAULT_CONFIG };
  }
}

/** Save a config patch. `synced` = whether it reached Firestore. */
export async function saveConfig(patch: Partial<BoothConfig>): Promise<{ config: BoothConfig; synced: boolean }> {
  const current = lsGet<BoothConfig>(LS_CONFIG) ?? { ...DEFAULT_CONFIG };
  const optimistic = mergeConfig(current, patch);
  lsSet(LS_CONFIG, optimistic);
  try {
    await withTimeout(setDoc(doc(db, "pb_config", "main"), optimistic, { merge: true }));
    serverOnline = true;
    return { config: optimistic, synced: true };
  } catch {
    serverOnline = false;
    return { config: optimistic, synced: false };
  }
}

/* ---------- templates ---------- */

const TEMPLATES_COL = "pb_templates";

export async function listTemplates(): Promise<FrameTemplate[]> {
  try {
    const snaps = await withTimeout(getDocs(query(collection(db, TEMPLATES_COL), orderBy("sort", "asc"))));
    serverOnline = true;
    const list: FrameTemplate[] = [];
    for (const d of snaps.docs) {
      const blob = await readBlobDoc(db, TEMPLATES_COL, d.id);
      if (blob?.text) {
        try { list.push(JSON.parse(blob.text)); } catch { /* skip corrupt entry */ }
      }
    }
    if (list.length > 0) lsSet(LS_TEMPLATES, list);
    return list;
  } catch {
    serverOnline = false;
    return lsGet<FrameTemplate[]>(LS_TEMPLATES) ?? [];
  }
}

/** Replace the whole template set (order preserved). Falls back to localStorage. */
export async function saveTemplates(templates: FrameTemplate[]): Promise<{ templates: FrameTemplate[]; synced: boolean }> {
  lsSet(LS_TEMPLATES, templates);
  try {
    const existing = await withTimeout(getDocs(collection(db, TEMPLATES_COL)));
    const keepIds = new Set(templates.map((t) => t.id));
    await Promise.all(
      existing.docs.filter((d) => !keepIds.has(d.id)).map((d) => deleteBlobDoc(db, TEMPLATES_COL, d.id)),
    );
    await Promise.all(
      templates.map((t, i) => writeBlobDoc(db, TEMPLATES_COL, t.id, { sort: i }, JSON.stringify(t))),
    );
    serverOnline = true;
    return { templates, synced: true };
  } catch {
    serverOnline = false;
    return { templates, synced: false };
  }
}

/* ---------- job queue (booth-PC agent: DSLR + printer) ---------- */

const JOBS_COL = "pb_jobs";

async function createJob(type: string, payload: Record<string, unknown> = {}): Promise<string> {
  const ref = await addDoc(collection(db, JOBS_COL), { type, payload, status: "pending", createdAt: Date.now() });
  return ref.id;
}

function waitForJob(jobId: string, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); unsub(); fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error(
      "Waktu habis — pastikan agent (agent/index.cjs) berjalan di PC booth",
    ))), timeoutMs);
    const unsub = onSnapshot(
      doc(db, JOBS_COL, jobId),
      (snap) => {
        const d = snap.data();
        if (!d || d.status === "pending") return;
        if (d.status === "error") finish(() => reject(new Error(String(d.error || "job failed"))));
        else finish(() => resolve((d.result as Record<string, unknown>) || {}));
      },
      (err) => finish(() => reject(err)),
    );
  });
}

/* ---------- camera ---------- */

export interface CameraStatus {
  source: CameraSource;
  reachable: boolean;
  info?: string;
  error?: string;
}

export async function cameraStatus(): Promise<CameraStatus> {
  const cfg = await getConfig();
  if (cfg.camera.source === "webcam") return { source: "webcam", reachable: true };
  try {
    const jobId = await createJob("status", {});
    const r = await waitForJob(jobId, 15000);
    return { source: cfg.camera.source, reachable: !!r.reachable, info: r.info as string, error: r.error as string };
  } catch (e) {
    return { source: cfg.camera.source, reachable: false, error: (e as Error).message };
  }
}

/** Trigger one DSLR tethered capture (via the booth-PC agent). Returns a data-URL JPEG. */
export async function dslrCapture(): Promise<string> {
  const jobId = await createJob("capture", {});
  const r = await waitForJob(jobId, 30000);
  if (r.chunked) {
    const blob = await readBlobDoc(db, JOBS_COL, jobId);
    if (blob?.text) return blob.text;
  }
  if (typeof r.imageBase64 === "string") return r.imageBase64;
  throw new Error("Tidak ada gambar yang diterima dari kamera");
}

/* ---------- printing ---------- */

export async function listPrinters(): Promise<string[]> {
  try {
    const jobId = await createJob("printers", {});
    const r = await waitForJob(jobId, 15000);
    return (r.printers as string[]) || [];
  } catch {
    return [];
  }
}

export async function printPhoto(id: string): Promise<void> {
  const jobId = await createJob("print", { photoId: id });
  const r = await waitForJob(jobId, 30000);
  if (!r.ok) throw new Error(String(r.error || "Gagal mencetak"));
}
