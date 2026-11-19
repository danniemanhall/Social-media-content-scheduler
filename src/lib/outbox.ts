import { downloadFile } from "./drive";
import { getFile } from "./localMedia";
import { isImage, isVideo } from "./reel";
import type { MediaRef, OutboxFile, Slot } from "./types";

/**
 * Hands a post's files to the R2 outbox, where Meta fetches them from when
 * the publisher posts. Photos are turned into JPEGs (Instagram only takes
 * JPEG) and cropped into Instagram's allowed shapes.
 */

export async function outboxReady(): Promise<boolean> {
  try {
    const res = await fetch("/api/outbox");
    return res.ok && ((await res.json()) as { ready?: boolean }).ready === true;
  } catch {
    return false;
  }
}

async function blobOf(m: MediaRef): Promise<Blob> {
  if (m.source === "drive") return downloadFile(m.id);
  const b = await getFile(m.id);
  if (!b) throw new Error(`"${m.name}" was added on another device. Schedule it from there, or add the file from Drive.`);
  return b;
}

/** Which files a post sends, in order. */
export function filesFor(slot: Slot): { media?: MediaRef; driveId?: string; type: "image" | "video" }[] {
  const media = slot.media.filter((m) => isImage(m) || isVideo(m));
  const type = (m: MediaRef) => (isVideo(m) ? "video" : "image") as "image" | "video";
  if (slot.format === "reel") {
    if (slot.render?.driveId) return [{ driveId: slot.render.driveId, type: "video" }];
    const v = media.find(isVideo);
    return v ? [{ media: v, type: "video" }] : [];
  }
  if (slot.format === "carousel") return media.slice(0, 10).map((m) => ({ media: m, type: type(m) }));
  // Each photo or clip is one story frame; they go up one after another.
  if (slot.format === "story") return media.slice(0, 20).map((m) => ({ media: m, type: type(m) }));
  const first = media.find(isImage) ?? media.find(isVideo);
  return first ? [{ media: first, type: type(first) }] : [];
}

/**
 * Crops a photo, centred, to the post's size: 9:16 for stories, 4:5 portrait
 * for grid posts and carousels (Instagram's default 1080 × 1350), so every
 * photo fills the frame the same way.
 */
export function cropBox(w: number, h: number, story: boolean) {
  const target = story ? 9 / 16 : 4 / 5;
  const r = w / h;
  if (Math.abs(r - target) / target < 0.01) return { x: 0, y: 0, w, h };
  if (r > target) {
    const cw = Math.round(h * target);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / target);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

async function toJpeg(blob: Blob, story: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const box = cropBox(bmp.width, bmp.height, story);
  const scale = Math.min(1, 1440 / box.w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.w * scale);
  canvas.height = Math.round(box.h * scale);
  canvas.getContext("2d")!.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert the photo."))), "image/jpeg", 0.9));
}

export async function sendToOutbox(slot: Slot, onStep: (label: string) => void): Promise<OutboxFile[]> {
  const plan = filesFor(slot);
  if (!plan.length) throw new Error(slot.format === "reel" ? "Render the reel first, or add a video." : "Add a photo or video first.");
  const out: OutboxFile[] = [];
  const stamp = crypto.randomUUID().slice(0, 8);
  for (const [i, f] of plan.entries()) {
    onStep(`Preparing file ${i + 1} of ${plan.length}…`);
    let blob = f.driveId ? await downloadFile(f.driveId) : await blobOf(f.media!);
    if (f.type === "image") blob = await toJpeg(blob, slot.format === "story");
    const name = `${slot.id.replace(/[^\w-]/g, "")}-${stamp}-${i}.${f.type === "video" ? "mp4" : "jpg"}`;
    onStep(`Uploading file ${i + 1} of ${plan.length}…`);
    const res = await fetch(`/api/outbox/${name}`, { method: "PUT", body: blob, headers: { "content-type": blob.type || "application/octet-stream" } });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Upload failed (${res.status}).`);
    const { key, url } = (await res.json()) as { key: string; url: string };
    out.push({ key, url, type: f.type });
  }
  return out;
}

export async function clearOutbox(files: OutboxFile[]) {
  await Promise.all(files.map((f) => fetch(`/api/outbox/${f.key}`, { method: "DELETE" }).catch(() => undefined)));
}
