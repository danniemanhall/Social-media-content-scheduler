import { FPS, H, W } from "./reel";

/**
 * B-roll from a still photo: short vertical clips that look like someone
 * filming the scene on their phone. The photo itself is never changed: no
 * relighting, no colour grade, no filters, no generated pixels. Only the
 * "camera" moves, and it moves the way a hand-held phone does:
 *
 * - it is already moving when the shot starts (no slideshow ease from a standstill),
 * - it drifts and rolls a fraction of a degree with smooth random hand movement,
 *   not a regular wobble,
 * - every frame is drawn at sub-pixel precision with a little motion blur, so
 *   slow moves glide instead of stepping a pixel at a time,
 * - close-ups land on the most detailed part of the photo (the rope texture,
 *   not a blank wall), and focus settles in the first moments like a phone's
 *   autofocus,
 * - a faint, moving sensor grain keeps the picture from looking frozen.
 *
 * The maths lives here (testable without a browser); src/lib/brollRender.ts
 * draws the frames.
 */

export type BrollMove = "push" | "pull" | "pan" | "tilt" | "detail";

export const BROLL_MOVES: Record<BrollMove, { label: string; hint: string }> = {
  push: { label: "Walk in", hint: "Steps gently towards the scene" },
  pull: { label: "Step back", hint: "Starts close and backs off to show the setting" },
  pan: { label: "Slide across", hint: "Moves sideways past the scene, best on wide photos" },
  tilt: { label: "Tilt up", hint: "Looks slowly up the scene, best on tall shelves and displays" },
  detail: { label: "Close-up", hint: "Gets in close on the most detailed part of the photo" },
};

export const BROLL_SECONDS = 5;

/** A point on the photo, 0 to 1 across and down. */
export interface FocusPoint {
  x: number;
  y: number;
}

/** Where the camera is at one moment. */
export interface CameraFrame {
  /** Centre of the view on the photo, in photo pixels. */
  cx: number;
  cy: number;
  /** Output pixels per photo pixel. */
  scale: number;
  /** Camera roll in radians. */
  roll: number;
  /** Out-of-focus blur in output pixels (0 = sharp). */
  blur: number;
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

/** Smooth 1D value noise between -1 and 1, so hand movement wanders instead of repeating. */
function noise1(seed: number) {
  const r = rng(seed);
  const pts = Array.from({ length: 256 }, () => r() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const a = pts[((i % 256) + 256) % 256];
    const b = pts[(((i + 1) % 256) + 256) % 256];
    return a + (b - a) * u;
  };
}

/** Hand-held wander at time t (seconds): slow sway, a little breathing and a faint tremor. */
function handheld(seed: number) {
  const n = [noise1(seed), noise1(seed + 101), noise1(seed + 202), noise1(seed + 303)];
  return (t: number) => (n[0](t * 0.45) + 0.45 * n[1](t * 1.1 + 7) + 0.18 * n[2](t * 2.7 + 13) + 0.05 * n[3](t * 7 + 29)) / 1.68;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How far the camera has got through its move: mostly steady, already moving at the cut. */
const progress = (t: number) => 0.8 * t + 0.2 * smooth(t);

/** Hand movement in output pixels and radians. Gentle: a steady hand, not a shaky one. */
const SWAY_PX = 9;
const ROLL_RAD = (0.35 * Math.PI) / 180;
/** Detail shots never enlarge the photo past this many output pixels per photo pixel, so they stay sharp. */
const MAX_DETAIL_SCALE = 1.05;

/**
 * Where the camera is at time t (seconds) in a shot of `seconds` on a photo of
 * `img` size. The view always stays inside the photo, even when it rolls.
 */
export function cameraAt(
  move: BrollMove,
  t: number,
  seconds: number,
  img: { width: number; height: number },
  seed: number,
  focus: FocusPoint = { x: 0.5, y: 0.5 },
): CameraFrame {
  const { width: iw, height: ih } = img;
  const cover = Math.max(W / iw, H / ih);
  const r = rng(seed * 7919 + 17);
  const dir = r() < 0.5 ? -1 : 1;
  const p = progress(clamp(t / seconds, 0, 1));
  const hx = handheld(seed);
  const hy = handheld(seed + 1);
  const hr = handheld(seed + 2);

  // Where the view is aimed, 0 to 1 across the room the photo leaves for moving.
  // Pan and tilt travel through that room, so they never stall against an edge.
  let zoom: number;
  let ax: number;
  let ay: number;
  let blur = 0;
  switch (move) {
    case "push":
      zoom = 1.08 + 0.12 * p;
      ax = 0.5 + (focus.x - 0.5) * 0.6 * p;
      ay = 0.5 + (focus.y - 0.5) * 0.6 * p;
      break;
    case "pull":
      zoom = 1.24 - 0.14 * p;
      ax = 0.5 + (focus.x - 0.5) * 0.7 * (1 - p);
      ay = 0.5 + (focus.y - 0.5) * 0.7 * (1 - p);
      break;
    case "pan":
      zoom = 1.1;
      ax = 0.5 + dir * (p - 0.5) * 0.8;
      ay = 0.5 + (focus.y - 0.5) * 0.3;
      break;
    case "tilt":
      zoom = 1.16;
      ax = 0.5 + (focus.x - 0.5) * 0.3;
      ay = 0.9 - 0.8 * p;
      break;
    case "detail": {
      // Close enough to see the rope, never so close the photo goes soft.
      zoom = clamp(MAX_DETAIL_SCALE / cover, 1.5, 2.6) * (1 + 0.04 * p);
      ax = focus.x + dir * (p - 0.5) * 0.06;
      ay = focus.y + (p - 0.5) * 0.03;
      // A phone's autofocus finding the texture in the first moments.
      blur = 1.8 * (1 - smooth(clamp(t / 0.4, 0, 1)));
      break;
    }
  }

  const roll = hr(t + 40) * ROLL_RAD;
  // Zoom in just enough that the rolled frame never shows the photo's edge.
  const c = Math.abs(Math.cos(roll));
  const s = Math.abs(Math.sin(roll));
  const minScale = Math.max((W * c + H * s) / iw, (W * s + H * c) / ih) * 1.002;
  const scale = Math.max(cover * zoom, minScale);
  const bx = (W * c + H * s) / (2 * scale);
  const by = (W * s + H * c) / (2 * scale);

  // Detail aims at a point on the photo; the other moves aim within the room to move.
  const tx = move === "detail" ? ax * iw : bx + (iw - 2 * bx) * clamp(ax, 0, 1);
  const ty = move === "detail" ? ay * ih : by + (ih - 2 * by) * clamp(ay, 0, 1);
  const cx = clamp(tx + (hx(t) * SWAY_PX) / scale, bx, iw - bx);
  const cy = clamp(ty + (hy(t + 20) * SWAY_PX) / scale, by, ih - by);
  return { cx, cy, scale, roll, blur };
}

/**
 * The most detailed part of a photo, for close-ups: the window with the most
 * texture (edges), gently favouring the middle. `gray` is a small greyscale
 * copy of the photo, w x h, values 0 to 255. `weight` (0 to 1 per pixel, optional)
 * says how much each pixel's texture counts, so leaves through a window don't
 * win over the rope on the shelf.
 */
export function detailFocus(gray: ArrayLike<number>, w: number, h: number, windowFrac = 0.4, weight?: ArrayLike<number>): FocusPoint {
  // Edge strength per pixel, then a summed-area table so every window is cheap to score.
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
      // Favour the middle, and slightly below it: products sit on tables and shelves, not in the sky.
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
  return ["-y", "-framerate", String(FPS), "-i", pattern, "-an", "-vf", `scale=${W}:${H},setsar=1,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output];
}

/** A file name for a clip, from the photo's name. */
export function brollName(photoName: string, move: BrollMove) {
  const base = photoName.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  return `${base} - ${BROLL_MOVES[move].label.toLowerCase()}.mp4`.replace(/[\\/:*?"<>|]/g, "-");
}

/** Average seconds each photo gets in a B-roll video for a post (its shot plus any close-up). */
export const BROLL_VIDEO_SHOT = 3.3;
/** How many photos a B-roll video for a post uses. */
export const BROLL_VIDEO_PHOTOS = 5;

/** One shot of a B-roll video: a move on a photo, sometimes followed by a close-up cut of the same photo. */
export interface BrollShot<T> {
  photo: T;
  move: BrollMove;
  seconds: number;
  /** Seconds of a close-up cut straight after, as if the person filming stepped in. 0 for none. */
  closeUp: number;
  seed: number;
}

/** Shot lengths vary a little, like a person editing by feel rather than a slideshow timer. */
const LENGTHS = [2.6, 2.2, 2.9, 2.4, 2.7, 2.3, 2.8, 2.5];
const CLOSE_UP = 1.5;

/**
 * A camera move for each photo, so the cuts feel like real footage: wide photos
 * slide across, tall ones tilt or walk in, every other photo gets a quick
 * close-up cut, and no move repeats straight after itself.
 */
export function brollPlan<T extends { width?: number; height?: number }>(photos: T[]): BrollShot<T>[] {
  const cycle: BrollMove[] = ["push", "tilt", "pull", "push", "pull"];
  let c = 0;
  let last: BrollMove | null = null;
  return photos.map((photo, i) => {
    const ratio = photo.width && photo.height ? photo.width / photo.height : 0.75;
    const wide = ratio > 1.1;
    let move: BrollMove = wide && last !== "pan" ? "pan" : cycle[c++ % cycle.length];
    // Tilting needs height to travel up; on a square or wide photo, walk in instead.
    if (move === "tilt" && ratio > 0.9) move = "push";
    if (move === last) move = last === "push" ? "pull" : "push";
    last = move;
    const closeUp = i % 2 === 0 ? CLOSE_UP : 0;
    const seconds = Math.round((LENGTHS[i % LENGTHS.length] + (closeUp ? 0 : 0.9)) * 10) / 10;
    return { photo, move, seconds, closeUp, seed: 1000 + i * 37 };
  });
}

/** Total length of a planned B-roll video, in seconds. */
export const planSeconds = (plan: { seconds: number; closeUp: number }[]) => plan.reduce((s, p) => s + p.seconds + p.closeUp, 0);

/** ffmpeg arguments that join same-format clips (listed in a concat file) without re-encoding. */
export function joinArgs(listFile: string, output: string): string[] {
  return ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output];
}

/** A file name for a post's B-roll video. */
export function brollVideoName(title: string) {
  return `${(title || "Roopip").slice(0, 60)} - b-roll.mp4`.replace(/[\\/:*?"<>|]/g, "-");
}
