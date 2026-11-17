import type { Format } from "./types";

export interface MediaCheck {
  ok: boolean;
  message: string;
}

const RATIO = { vertical: 9 / 16, portrait: 4 / 5, square: 1 };

/** Checks an image or video's shape (and length) against what the slot needs. */
export function checkMedia(format: Format, width: number, height: number, durationSec?: number): MediaCheck {
  if (!width || !height) return { ok: true, message: "Size unknown" };
  const r = width / height;
  const near = (target: number) => Math.abs(r - target) / target < 0.03;

  if (format === "reel" || format === "story") {
    if (!near(RATIO.vertical)) {
      return { ok: false, message: `Needs vertical 9:16 (this is ${width}×${height}). It will be cropped.` };
    }
    if (durationSec && format === "story" && durationSec > 60) {
      return { ok: false, message: "Stories show up to 60 seconds per frame. Trim or split it." };
    }
    if (durationSec && format === "reel" && durationSec > 90) {
      return { ok: false, message: "Reels work best under 90 seconds. Consider trimming." };
    }
    return { ok: true, message: "Vertical 9:16, good to go" };
  }
  if (near(RATIO.portrait)) return { ok: true, message: "Portrait 4:5, good to go" };
  if (near(RATIO.square)) return { ok: true, message: "Square works; 4:5 fills more of the feed" };
  if (r < RATIO.portrait) return { ok: false, message: "Too tall for the grid. Crop to 4:5." };
  return { ok: false, message: "Landscape shows small in the feed. Crop to 4:5 if you can." };
}
