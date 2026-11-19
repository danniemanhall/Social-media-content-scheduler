import { analyseFraming, cameraAt, type BrollMove, type Framing } from "./broll";
import { FPS, H, W } from "./reel";

/**
 * Draws B-roll frames in the browser. The canvas places the photo at
 * sub-pixel positions with high-quality smoothing, which is what makes slow
 * camera moves glide; ffmpeg's zoompan rounds to whole pixels and steps.
 */

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const ctx2d = (c: AnyCanvas) => c.getContext("2d", { alpha: false }) as Canvas2D;

/** Photos bigger than this on their long side are scaled down first; close-ups never need more. */
const MAX_SIDE = 4200;

/** Decodes a photo the right way up (phone photos are often stored sideways with a rotation tag). */
export async function loadPhoto(blob: Blob): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const long = Math.max(bmp.width, bmp.height);
  if (long <= MAX_SIDE) return bmp;
  const k = MAX_SIDE / long;
  const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: "high" });
  bmp.close();
  return small;
}

/** How to frame the photo: busy scene or single product, where the subject and the detail are. */
export function findFraming(bmp: ImageBitmap): Framing {
  const w = 96;
  const h = Math.max(8, Math.round((w * bmp.height) / bmp.width));
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  const weight = new Float32Array(w * h);
  const colours = new Map<number, number>();
  for (let i = 0; i < w * h; i++) {
    const [r, gr, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    gray[i] = 0.299 * r + 0.587 * gr + 0.114 * b;
    // Roopip's rope is soft, muted colour; leaves and sky are vivid. Count vivid texture less.
    const hi = Math.max(r, gr, b);
    const sat = hi ? (hi - Math.min(r, gr, b)) / hi : 0;
    weight[i] = Math.min(1, Math.max(0.08, 1 - (sat - 0.2) * 4.5));
    const bin = ((r >> 6) << 4) | ((gr >> 6) << 2) | (b >> 6);
    colours.set(bin, (colours.get(bin) ?? 0) + 1);
  }
  return analyseFraming(gray, w, h, weight, Math.max(...colours.values()) / (w * h));
}

/** Sub-frames blended per output frame: the soft motion blur of a film camera's shutter. */
const SUBFRAMES = 3;
/** Fraction of the frame time the "shutter" is open (a 180 degree shutter). */
const SHUTTER = 0.5;

/** Films one shot: calls `onFrame` with each frame as a JPEG, in order. */
export async function filmShot(
  bmp: ImageBitmap,
  shot: { move: BrollMove; seconds: number; dir: 1 | -1; framing: Framing },
  onFrame: (jpeg: Uint8Array, index: number, total: number) => Promise<void> | void,
): Promise<number> {
  const canvas = makeCanvas(W, H);
  const g = ctx2d(canvas);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  const frames = Math.round(shot.seconds * FPS);
  const size = { width: bmp.width, height: bmp.height };

  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < SUBFRAMES; k++) {
      const t = (f + (k / SUBFRAMES - 0.5) * SHUTTER) / FPS;
      const cam = cameraAt(shot.move, Math.max(0, t), shot.seconds, size, shot.framing, shot.dir);
      // Running average of the sub-frames.
      g.globalAlpha = 1 / (k + 1);
      g.setTransform(cam.scale, 0, 0, cam.scale, W / 2 - cam.cx * cam.scale, H / 2 - cam.cy * cam.scale);
      g.drawImage(bmp, 0, 0);
    }
    g.globalAlpha = 1;
    const blob = "convertToBlob" in canvas ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 }) : await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("Couldn't draw a frame"))), "image/jpeg", 0.95));
    await onFrame(new Uint8Array(await blob.arrayBuffer()), f, frames);
  }
  return frames;
}
