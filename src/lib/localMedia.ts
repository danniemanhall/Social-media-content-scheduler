import type { MediaRef } from "./types";

/**
 * Files dropped straight into a slot. The original stays in this browser
 * (IndexedDB); a small thumbnail travels with the slot so everyone sees it.
 */

const DB_NAME = "roopip-media";
const STORE = "files";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(id: string, file: Blob) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(id: string): Promise<Blob | undefined> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

function thumbFrom(source: CanvasImageSource, w: number, h: number): string {
  const max = 360;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function describeImage(file: File): Promise<Partial<MediaRef>> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const meta = { width: img.naturalWidth, height: img.naturalHeight, thumbnail: thumbFrom(img, img.naturalWidth, img.naturalHeight) };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    img.onerror = () => resolve({});
    img.src = url;
  });
}

function describeVideo(file: File): Promise<Partial<MediaRef>> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, v.duration / 2);
    };
    v.onseeked = () => {
      const meta = {
        width: v.videoWidth,
        height: v.videoHeight,
        durationSec: Math.round(v.duration),
        thumbnail: thumbFrom(v, v.videoWidth, v.videoHeight),
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    v.onerror = () => resolve({});
    v.src = url;
  });
}

export async function addLocalFile(file: File): Promise<MediaRef> {
  const id = `local-${crypto.randomUUID()}`;
  const meta = file.type.startsWith("video/") ? await describeVideo(file) : await describeImage(file);
  await putFile(id, file);
  return { id, source: "local", name: file.name, mimeType: file.type, ...meta };
}
