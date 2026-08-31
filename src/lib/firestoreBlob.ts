// Firestore caps a document at ~1MiB, so large strings (photo data-URLs,
// template images) are split across a "chunks" subcollection and rejoined on
// read. Meta fields (small) live on the parent document itself.

import {
  collection, doc, getDoc, getDocs, deleteDoc, writeBatch, type Firestore,
} from "firebase/firestore";

const CHUNK_SIZE = 700_000; // chars — well under the 1MiB/doc limit

function splitChunks(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) out.push(text.slice(i, i + CHUNK_SIZE));
  return out;
}

/** Write `meta` + `text` (chunked) to `{collectionPath}/{id}`. Overwrites any previous chunks. */
export async function writeBlobDoc(
  db: Firestore, collectionPath: string, id: string, meta: Record<string, unknown>, text: string,
): Promise<void> {
  const ref = doc(db, collectionPath, id);
  const chunksCol = collection(ref, "chunks");
  const existing = await getDocs(chunksCol);
  const chunks = splitChunks(text);

  const batch = writeBatch(db);
  for (const d of existing.docs) batch.delete(d.ref);
  chunks.forEach((c, i) => batch.set(doc(chunksCol, String(i)), { data: c }));
  // merge: true — writeBlobDoc may target a doc that also carries unrelated
  // fields (e.g. a job document's status/payload), so never clobber those.
  batch.set(ref, { ...meta, chunkCount: chunks.length, updatedAt: Date.now() }, { merge: true });
  await batch.commit();
}

/** Read `{collectionPath}/{id}` and rejoin its chunks into one string. */
export async function readBlobDoc(
  db: Firestore, collectionPath: string, id: string,
): Promise<{ meta: Record<string, unknown>; text: string } | null> {
  const ref = doc(db, collectionPath, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const meta = snap.data() as Record<string, unknown>;
  const n = Number(meta.chunkCount) || 0;
  const chunksCol = collection(ref, "chunks");
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) => getDoc(doc(chunksCol, String(i)))),
  );
  const text = parts.map((p) => (p.exists() ? (p.data().data as string) : "")).join("");
  return { meta, text };
}

/** Delete `{collectionPath}/{id}` and all of its chunks. */
export async function deleteBlobDoc(db: Firestore, collectionPath: string, id: string): Promise<void> {
  const ref = doc(db, collectionPath, id);
  const chunksCol = collection(ref, "chunks");
  const existing = await getDocs(chunksCol);
  const batch = writeBatch(db);
  for (const d of existing.docs) batch.delete(d.ref);
  batch.delete(ref);
  await batch.commit();
}
