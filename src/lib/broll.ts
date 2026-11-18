import { FPS, H, W } from "./reel";

/**
 * B-roll from a still photo: short vertical clips that move through the photo
 * the way someone filming it by hand would. The photo itself is never changed:
 * no relighting, no colour grade, no filters, no generated pixels. Each clip
 * is a slow, eased camera move (push in, pull back, pan, close-up) with a
 * little natural hand movement, so a set of them cuts together like footage.
 */

export type BrollMove = "push" | "pull" | "pan" | "detail";

export const BROLL_MOVES: Record<BrollMove, { label: string; hint: string }> = {
  push: { label: "Slow push in", hint: "Walks gently towards the scene" },
  pull: { label: "Pull back", hint: "Starts close and eases out to show the setting" },
  pan: { label: "Pan across", hint: "Slides sideways across the scene, best on wide photos" },
  detail: { label: "Close-up drift", hint: "A tighter angle on the middle of the photo, drifting slowly" },
};

export const BROLL_SECONDS = 5;

/** Work at 1.5 times the output size so slow moves stay smooth instead of stepping a pixel at a time. */
const SW = W * 1.5;
const SH = H * 1.5;

/** Gentle hand-held movement in source pixels: a slow sway plus a faint tremor. */
function sway(v: string, seed: number, amp: number) {
  const a = amp.toFixed(1);
  const b = (amp * 0.35).toFixed(1);
  return `${a}*sin(${v}*${(0.9 + seed * 0.13).toFixed(2)}+${seed})+${b}*sin(${v}*${(4.7 + seed * 0.4).toFixed(2)}+${seed * 2})`;
}

/** Ease in and out (smoothstep) over progress p, 0 to 1. */
const ease = (p: string) => `(${p})*(${p})*(3-2*(${p}))`;

/**
 * ffmpeg arguments for one clip. The input is a still image file; the output
 * is a silent 1080 x 1920 MP4 of `seconds` length.
 */
export function brollArgs(input: string, move: BrollMove, output: string, seconds = BROLL_SECONDS): string[] {
  const frames = Math.round(seconds * FPS);
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart"];
  let vf: string;

  if (move === "pan") {
    // Keep the photo's full width so there is something to pan across, then
    // move a 9:16 window sideways (at most a third of a frame, so it stays slow).
    const p = ease(`min(t/${seconds},1)`);
    vf = [
      `scale=${SW * 1.12}:${SH * 1.12}:force_original_aspect_ratio=increase`,
      `crop=${SW}:${SH}:` +
        `x='(iw-ow)/2-min(iw-ow,ow*0.33)/2+min(iw-ow,ow*0.33)*${p}+${sway("t", 1, 10)}':` +
        `y='(ih-oh)/2+${sway("t", 2, 8)}'`,
      `scale=${W}:${H}:flags=bicubic`,
    ].join(",");
  } else {
    const p = ease(`on/${frames}`);
    const [z0, z1] = move === "push" ? [1.05, 1.15] : move === "pull" ? [1.18, 1.05] : [1.55, 1.65];
    const z = `${z0}+${(z1 - z0).toFixed(3)}*${p}`;
    vf = [
      `scale=${SW}:${SH}:force_original_aspect_ratio=increase`,
      `crop=${SW}:${SH}`,
      `zoompan=z='${z}':x='iw/2-(iw/zoom/2)+${sway("on/30", 3, 12)}':y='ih/2-(ih/zoom/2)+${sway("on/30", 4, 10)}':d=1:s=${W}x${H}:fps=${FPS}`,
    ].join(",");
  }

  return ["-y", "-loop", "1", "-framerate", String(FPS), "-t", String(seconds), "-i", input, "-an", "-vf", `${vf},setsar=1,format=yuv420p`, "-t", String(seconds), "-frames:v", String(frames), ...encode, output];
}

/** A file name for a clip, from the photo's name. */
export function brollName(photoName: string, move: BrollMove) {
  const base = photoName.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  return `${base} - ${BROLL_MOVES[move].label.toLowerCase()}.mp4`.replace(/[\\/:*?"<>|]/g, "-");
}
