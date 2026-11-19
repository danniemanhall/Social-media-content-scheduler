import { FPS, H, W } from "./reel";
import type { MediaTags } from "./tags";

/**
 * B-roll from a still photo: short vertical clips that move like a camera on
 * a slider, the way a product film is shot. Smooth, steady and slow: each shot
 * glides sideways across the scene with a gentle push in for depth, and the
 * next shot glides back the other way. The photo itself is never changed: no
 * relighting, no colour grade, no filters, no generated pixels.
 *
 * Framing follows the photo. A busy scene (a styled table, a full shelf) is
 * filmed close, on its most detailed part, so the rope work fills the frame.
 * A single product on a plain background (one planter with a plant) is filmed
 * wider, so the whole piece stays in view.
 *
 * Frames are drawn at sub-pixel precision with a little motion blur (see
 * src/lib/brollRender.ts), so slow moves glide instead of stepping.
 */

export type BrollMove = "push" | "pull" | "pan" | "tilt" | "detail";

export const BROLL_MOVES: Record<BrollMove, { label: string; hint: string }> = {
  pan: { label: "Slide across", hint: "Glides sideways across the scene, like a camera on a slider" },
  push: { label: "Slow push in", hint: "Moves gently towards the product" },
  pull: { label: "Slow pull back", hint: "Starts close and eases back to show the setting" },
  tilt: { label: "Tilt up", hint: "Rises slowly up the scene, best on tall shelves and displays" },
  detail: { label: "Close-up slide", hint: "Glides close across the most detailed part of the photo" },
};

export const BROLL_SECONDS = 5;

/** A point on the photo, 0 to 1 across and down. */
export interface FocusPoint {
  x: number;
  y: number;
}

/** How to frame a photo, worked out from what's in it. */
export interface Framing {
  /** The most detailed spot, for close shots. */
  focus: FocusPoint;
  /** Where the subject sits, 0 to 1: left, top, right, bottom. */
  subject: { x0: number; y0: number; x1: number; y1: number };
  /** True for a busy scene (detail all over), false for one product on a plain background. */
  busy: boolean;
}

export const DEFAULT_FRAMING: Framing = { focus: { x: 0.5, y: 0.5 }, subject: { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 }, busy: true };

/** Where the camera is at one moment. */
export interface CameraFrame {
  /** Centre of the view on the photo, in photo pixels. */
  cx: number;
  cy: number;
  /** Output pixels per photo pixel. */
  scale: number;
}

/** A small, fast, seeded random number generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A slider move: steady through the middle, softly eased at the ends. */
const progress = (t: number) => 0.65 * t + 0.35 * smooth(t);

/** How far a slide travels, in output pixels per second: slow and calm. */
const SLIDE_PX_PER_SEC = 75;
/** Never enlarge the photo past this many output pixels per photo pixel, so it stays sharp. */
const MAX_SCALE = 1.05;

/** Zoom (relative to filling the frame) that keeps the subject in view with breathing room. */
function fitZoom(img: { width: number; height: number }, cover: number, f: Framing) {
  const bw = Math.max(0.05, f.subject.x1 - f.subject.x0) * img.width * 1.3;
  const bh = Math.max(0.05, f.subject.y1 - f.subject.y0) * img.height * 1.15;
  return clamp(Math.min(W / cover / bw, H / cover / bh), 1.04, 1.3);
}

/** Zoom for a close shot: about half the photo's width in view, never past sharp. */
function closeZoom(img: { width: number; height: number }, cover: number, tighter = 1) {
  return clamp((W / cover / (0.5 * img.width)) * tighter, 1.25, Math.max(1.25, MAX_SCALE / cover));
}

/**
 * Where the camera is at time t (seconds) in a shot of `seconds` on a photo of
 * `img` size. `dir` is 1 to slide left to right, -1 for right to left. The view
 * always stays inside the photo, and a slide never stalls against an edge.
 */
export function cameraAt(
  move: BrollMove,
  t: number,
  seconds: number,
  img: { width: number; height: number },
  framing: Framing = DEFAULT_FRAMING,
  dir: 1 | -1 = 1,
): CameraFrame {
  const { width: iw, height: ih } = img;
  const cover = Math.max(W / iw, H / ih);
  const p = progress(clamp(t / seconds, 0, 1));
  const f = framing;
  const sx = (f.subject.x0 + f.subject.x1) / 2;
  const sy = (f.subject.y0 + f.subject.y1) / 2;
  const close = move === "detail" || (move === "pan" && f.busy);
  const aim = close ? f.focus : { x: sx, y: sy };

  // Zoom at the start and end of the shot; a slide also eases in a little for depth.
  let z0: number;
  let z1: number;
  if (move === "detail") z0 = z1 = closeZoom(img, cover, f.busy ? 1.15 : 1);
  else if (move === "pan") z0 = z1 = f.busy ? closeZoom(img, cover) : fitZoom(img, cover, f);
  else if (move === "push") [z0, z1] = [fitZoom(img, cover, f), fitZoom(img, cover, f) * 1.08];
  else if (move === "pull") [z0, z1] = [fitZoom(img, cover, f) * 1.09, fitZoom(img, cover, f)];
  else z0 = z1 = Math.max(1.15, fitZoom(img, cover, f));
  if (move === "pan" || move === "detail") z1 = z0 * 1.035;

  const scale = cover * (z0 + (z1 - z0) * p);
  // The least room to move is at the widest point of the shot; plan the path inside it.
  const wideScale = cover * Math.min(z0, z1);
  const hw = W / (2 * wideScale);
  const hh = H / (2 * wideScale);
  const travel = (SLIDE_PX_PER_SEC * seconds) / wideScale;

  const along = (centre: number, lo: number, hi: number, dist: number) => {
    const d = Math.min(dist, hi - lo);
    const c = clamp(centre, lo + d / 2, hi - d / 2);
    return { c, d };
  };

  let cx: number;
  let cy: number;
  if (move === "pan" || move === "detail") {
    const { c, d } = along(aim.x * iw, hw, iw - hw, travel);
    cx = c + dir * (p - 0.5) * d;
    cy = aim.y * ih;
  } else if (move === "tilt") {
    const { c, d } = along(sy * ih, hh, ih - hh, travel);
    cx = aim.x * iw;
    cy = c + (0.5 - p) * d;
  } else {
    // Push and pull drift a touch towards the subject as they move.
    cx = (0.5 + (aim.x - 0.5) * (move === "push" ? p : 1 - p)) * iw;
    cy = (0.5 + (aim.y - 0.5) * (move === "push" ? p : 1 - p)) * ih;
  }
  const bx = W / (2 * scale);
  const by = H / (2 * scale);
  return { cx: clamp(cx, bx, iw - bx), cy: clamp(cy, by, ih - by), scale };
}

/**
 * How to frame a photo, from a small greyscale copy (w x h, 0 to 255) and an
 * optional per-pixel weight (0 to 1) saying how much each pixel's texture
 * counts, so leaves through a window don't win over the rope on the shelf.
 * `topColourShare` is the share of the photo taken by its most common colour.
 */
export function analyseFraming(gray: ArrayLike<number>, w: number, h: number, weight?: ArrayLike<number>, topColourShare?: number): Framing {
  const e = new Float64Array(w * h);
  let total = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x + 1 < w ? Math.abs(gray[i + 1] - gray[i]) : 0;
      const gy = y + 1 < h ? Math.abs(gray[i + w] - gray[i]) : 0;
      e[i] = (gx + gy) * (weight ? weight[i] : 1);
      total += e[i];
    }
  // Where most of the texture is: the middle 80% of it, across and down.
  const span = (n: number, at: (k: number) => number) => {
    const m = new Float64Array(n);
    for (let k = 0; k < n; k++) m[k] = at(k);
    let acc = 0;
    let lo = 0;
    let hi = n - 1;
    let gotLo = false;
    for (let k = 0; k < n; k++) {
      acc += m[k];
      if (!gotLo && acc >= total * 0.1) {
        lo = k;
        gotLo = true;
      }
      if (acc >= total * 0.9) {
        hi = k;
        break;
      }
    }
    return [lo / n, (hi + 1) / n];
  };
  const [x0, x1] = total ? span(w, (x) => { let s = 0; for (let y = 0; y < h; y++) s += e[y * w + x]; return s; }) : [0.2, 0.8];
  const [y0, y1] = total ? span(h, (y) => { let s = 0; for (let x = 0; x < w; x++) s += e[y * w + x]; return s; }) : [0.2, 0.8];

  // Busy when detail fills much of the frame: count blocks with real texture.
  const B = 8;
  const cols = Math.ceil(w / B);
  const rows = Math.ceil(h / B);
  const blocks = new Float64Array(cols * rows);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) blocks[Math.floor(y / B) * cols + Math.floor(x / B)] += e[y * w + x];
  const mean = total / blocks.length;
  const textured = blocks.filter((b) => b > mean * 0.6).length / blocks.length;
  // A single product is mostly one colour (the rope) on its background; a busy
  // scene mixes many. Without colour, fall back to how much of it is textured.
  const busy = topColourShare !== undefined ? topColourShare < 0.5 && textured > 0.3 : textured > 0.5 && (x1 - x0) * (y1 - y0) > 0.4;

  return { focus: detailFocus(gray, w, h, 0.45, weight), subject: { x0, y0, x1, y1 }, busy };
}

/**
 * The most detailed part of a photo, for close shots: the window with the
 * most texture (edges), favouring the middle and slightly below it.
 */
export function detailFocus(gray: ArrayLike<number>, w: number, h: number, windowFrac = 0.4, weight?: ArrayLike<number>): FocusPoint {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = x + 1 < w ? Math.abs(gray[i + 1] - gray[i]) : 0;
      const gy = y + 1 < h ? Math.abs(gray[i + w] - gray[i]) : 0;
      row += (gx + gy) * (weight ? weight[i] : 1);
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const ww = Math.max(2, Math.round(w * windowFrac));
  const wh = Math.min(h, Math.max(2, Math.round(ww * (H / W))));
  let best = -1;
  let bx = (w - ww) / 2;
  let by = (h - wh) / 2;
  const step = Math.max(1, Math.round(w / 40));
  for (let y = 0; y + wh <= h; y += step) {
    for (let x = 0; x + ww <= w; x += step) {
      const sum = sat[(y + wh) * (w + 1) + x + ww] - sat[y * (w + 1) + x + ww] - sat[(y + wh) * (w + 1) + x] + sat[y * (w + 1) + x];
      const dx = (x + ww / 2) / w - 0.5;
      const dy = (y + wh / 2) / h - 0.5;
      // Products sit on tables and shelves, not in the sky.
      const score = sum * (1 - 0.9 * (dx * dx + dy * dy)) * (1 + 0.6 * dy);
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
  }
  return { x: (bx + ww / 2) / w, y: (by + wh / 2) / h };
}

/** ffmpeg arguments that encode numbered JPEG frames (e.g. "f%05d.jpg") into a silent 1080 x 1920 MP4. */
export function framesArgs(pattern: string, output: string): string[] {
  return ["-y", "-framerate", String(FPS), "-i", pattern, "-an", "-vf", `scale=${W}:${H},setsar=1,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output];
}

/** A file name for a clip, from the photo's name. */
export function brollName(photoName: string, move: BrollMove) {
  const base = photoName.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  return `${base} - ${BROLL_MOVES[move].label.toLowerCase()}.mp4`.replace(/[\\/:*?"<>|]/g, "-");
}

/** Average seconds each photo gets in a B-roll video for a post. */
export const BROLL_VIDEO_SHOT = 3.2;
/** How many photos a B-roll video for a post uses. */
export const BROLL_VIDEO_PHOTOS = 5;

/** One shot of a B-roll video: a slow slide across a photo. */
export interface BrollShot<T> {
  photo: T;
  move: BrollMove;
  /** 1 slides left to right, -1 right to left. */
  dir: 1 | -1;
  seconds: number;
  /** Busy scene (film close) or single product (film wide), when Claude's tags say; otherwise the photo is looked at. */
  busy?: boolean;
}

/** What Claude saw in a photo, as framing: busy scene, single product, or can't tell. */
export function busyFromTags(t: MediaTags | undefined): boolean | undefined {
  if (!t) return undefined;
  if (t.products.length >= 2 || t.subjects.length >= 4) return true;
  if (t.products.length <= 1 && t.subjects.length <= 2) return false;
  return undefined;
}

/** Shot lengths vary a little, like an editor cutting by feel rather than a slideshow timer. */
const LENGTHS = [3.4, 3.0, 3.3, 2.9, 3.2, 3.0, 3.4, 3.1];

/**
 * A shot for each photo: a slow slide, left to right, then the next photo
 * slides back right to left, and so on, so the cuts flow into each other.
 */
export function brollPlan<T>(photos: T[], tags: Record<string, MediaTags | undefined> = {}): BrollShot<T>[] {
  return photos.map((photo, i) => {
    const id = (photo as { id?: string }).id;
    return { photo, move: "pan", dir: i % 2 ? -1 : 1, seconds: LENGTHS[i % LENGTHS.length], busy: id ? busyFromTags(tags[id]) : undefined };
  });
}

/** Total length of a planned B-roll video, in seconds. */
export const planSeconds = (plan: { seconds: number }[]) => plan.reduce((s, p) => s + p.seconds, 0);

/** ffmpeg arguments that join same-format clips (listed in a concat file) without re-encoding. */
export function joinArgs(listFile: string, output: string): string[] {
  return ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output];
}

/** A file name for a post's B-roll video. */
export function brollVideoName(title: string) {
  return `${(title || "Roopip").slice(0, 60)} - b-roll.mp4`.replace(/[\\/:*?"<>|]/g, "-");
}
