import { cameraAt, detailFocus, rng, type BrollMove, type FocusPoint } from "./broll";
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

/** The most detailed part of the photo, for close-ups. */
export function findDetail(bmp: ImageBitmap): FocusPoint {
  const w = 96;
  const h = Math.max(8, Math.round((w * bmp.height) / bmp.width));
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  const weight = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, gr, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
    gray[i] = 0.299 * r + 0.587 * gr + 0.114 * b;
    // Roopip's rope is soft, muted colour; leaves and sky are vivid. Count vivid texture less.
    const hi = Math.max(r, gr, b);
    const sat = hi ? (hi - Math.min(r, gr, b)) / hi : 0;
    weight[i] = Math.min(1, Math.max(0.08, 1 - (sat - 0.2) * 4.5));
  }
  return detailFocus(gray, w, h, 0.4, weight);
}

/** A tile of faint sensor noise, made once and shifted every frame. */
let grainTile: AnyCanvas | null = null;
function grain(): AnyCanvas {
  if (grainTile) return grainTile;
  const size = 256;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  const r = rng(4242);
  for (let i = 0; i < size * size; i++) {
    // Roughly normal noise around mid-grey, so overlay neither brightens nor darkens.
    const v = 128 + ((r() + r() + r() - 1.5) / 1.5) * 90;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Sub-frames blended per output frame: a little motion blur, like a phone's shutter. */
const SUBFRAMES = 3;
/** Fraction of the frame time the "shutter" is open. */
const SHUTTER = 0.5;
/** How strong the sensor grain is (0 to 1). Faint: felt more than seen. */
const GRAIN = 0.05;

/**
 * Films one shot: calls `onFrame` with each frame as a JPEG, in order.
 * `seed` changes the hand movement so no two shots move alike.
 */
export async function filmShot(
  bmp: ImageBitmap,
  shot: { move: BrollMove; seconds: number; seed: number; focus: FocusPoint },
  onFrame: (jpeg: Uint8Array, index: number, total: number) => Promise<void> | void,
): Promise<number> {
  const canvas = makeCanvas(W, H);
  const g = ctx2d(canvas);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  const canBlur = "filter" in g;
  const tile = grain();
  const r = rng(shot.seed + 99);
  const frames = Math.round(shot.seconds * FPS);
  const size = { width: bmp.width, height: bmp.height };

  for (let f = 0; f < frames; f++) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    for (let k = 0; k < SUBFRAMES; k++) {
      const t = (f + (k / SUBFRAMES - 0.5) * SHUTTER) / FPS;
      const cam = cameraAt(shot.move, Math.max(0, t), shot.seconds, size, shot.seed, shot.focus);
      if (canBlur) g.filter = cam.blur > 0.05 ? `blur(${cam.blur.toFixed(2)}px)` : "none";
      // Running average of the sub-frames.
      g.globalAlpha = 1 / (k + 1);
      g.setTransform(1, 0, 0, 1, W / 2, H / 2);
      g.rotate(cam.roll);
      g.scale(cam.scale, cam.scale);
      g.translate(-cam.cx, -cam.cy);
      g.drawImage(bmp, 0, 0);
    }
    if (canBlur) g.filter = "none";
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = GRAIN;
    g.globalCompositeOperation = "overlay";
    const ox = -Math.floor(r() * 256);
    const oy = -Math.floor(r() * 256);
    for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) g.drawImage(tile, x, y);

    const blob = "convertToBlob" in canvas ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }) : await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error("Couldn't draw a frame"))), "image/jpeg", 0.92));
    await onFrame(new Uint8Array(await blob.arrayBuffer()), f, frames);
  }
  return frames;
}
