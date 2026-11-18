import type { IndexedMedia } from "./brandFit";
import { downloadFile, freshThumbnail, saveToAppFolder } from "./drive";
import { SHEET_CELL_PX, SHEET_CELLS, SHEET_COLS, SHEET_ROWS, type MediaTags, type TagSheet } from "./tags";

/** The Drive folder the contact sheets go in. Claude reads them from there. */
export const SHEETS_FOLDER = "Roopip photo index";

/** Files that still need Claude to look at them and aren't on a sheet yet. */
export function needsSheet(items: IndexedMedia[], tags: Record<string, MediaTags | undefined>, sheets: TagSheet[]): IndexedMedia[] {
  const onSheet = new Set(sheets.flatMap((s) => s.items));
  return items.filter((m) => !tags[m.id] && !onSheet.has(m.id) && (m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/")));
}

async function bitmapOf(m: IndexedMedia & { size?: number }): Promise<ImageBitmap | null> {
  if (m.source !== "drive") return null;
  const url = await freshThumbnail(m.id);
  if (url) {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      if (res.ok) return await createImageBitmap(await res.blob());
    } catch {
      /* thumbnails don't always allow this; fall back to the photo itself */
    }
  }
  if (!m.mimeType.startsWith("image/") || (m.size && m.size > 25 * 1024 * 1024)) return null;
  try {
    return await createImageBitmap(await downloadFile(m.id), { resizeWidth: 400, resizeQuality: "medium" });
  } catch {
    return null;
  }
}

/**
 * Draws up to 16 thumbnails into one numbered 4 x 4 grid and saves it to
 * Drive, so Claude can look at 16 photos in one go. Cells read left to right,
 * top to bottom; the number in each corner is its position in `items`.
 */
async function makeSheet(batch: IndexedMedia[], name: string): Promise<TagSheet | null> {
  const size = SHEET_CELL_PX;
  const canvas = document.createElement("canvas");
  canvas.width = SHEET_COLS * size;
  canvas.height = SHEET_ROWS * size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const items: string[] = [];
  for (const m of batch) {
    const bmp = await bitmapOf(m);
    if (!bmp) continue;
    const i = items.length;
    const x = (i % SHEET_COLS) * size;
    const y = Math.floor(i / SHEET_COLS) * size;
    // Fit the whole picture in the cell (no cropping), so nothing is hidden from Claude.
    const scale = Math.min((size - 6) / bmp.width, (size - 6) / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.fillStyle = "#e9e4da";
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.drawImage(bmp, x + (size - w) / 2, y + (size - h) / 2, w, h);
    bmp.close();
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x + 4, y + 4, 44, 30);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(String(i + 1), x + 10, y + 27);
    if (m.mimeType.startsWith("video/")) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(x + size - 64, y + 4, 60, 30);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("VID", x + size - 56, y + 27);
    }
    items.push(m.id);
  }
  if (!items.length) return null;
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't draw the sheet"))), "image/jpeg", 0.85));
  const saved = await saveToAppFolder(SHEETS_FOLDER, name, blob, "image/jpeg");
  return { fileId: saved.id, name, at: new Date().toISOString(), items };
}

/** Makes contact sheets for everything that needs one, calling `onSheet` after each. */
export async function makeSheets(
  pending: IndexedMedia[],
  onSheet: (sheet: TagSheet) => Promise<void>,
  onProgress: (label: string) => void,
): Promise<number> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  let made = 0;
  for (let i = 0; i < pending.length; i += SHEET_CELLS) {
    onProgress(`Preparing photos for Claude to look at (${Math.min(i + SHEET_CELLS, pending.length)} of ${pending.length})…`);
    const sheet = await makeSheet(pending.slice(i, i + SHEET_CELLS), `sheet ${stamp} ${String(i / SHEET_CELLS + 1).padStart(2, "0")}.jpg`);
    if (sheet) {
      await onSheet(sheet);
      made++;
    }
  }
  return made;
}
