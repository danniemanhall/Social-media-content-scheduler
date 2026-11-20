import type { MediaRef, ReelShot, Storyboard } from "./types";

/** Instagram reels: 9:16, 1080 x 1920, 30 fps. */
export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const TARGET_SECONDS = 18;
export const MAX_SHOTS = 8;
export const END_CARD_SECONDS = 2.5;
export const PHOTO_SECONDS = 2.5;

export const isVideo = (m: Pick<MediaRef, "mimeType">) => m.mimeType.startsWith("video/");
export const isImage = (m: Pick<MediaRef, "mimeType">) => m.mimeType.startsWith("image/");

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A first cut without AI: every clip and photo in order, trimmed so the reel
 * lands near 18 seconds, with one slow-motion moment and the title on screen.
 */
export function autoStoryboard(media: MediaRef[], title: string): Storyboard {
  const usable = media.filter((m) => isVideo(m) || isImage(m)).slice(0, MAX_SHOTS);
  const videos = usable.filter(isVideo);
  const photoTime = (usable.length - videos.length) * PHOTO_SECONDS;
  const perVideo = videos.length ? Math.min(5, Math.max(2, (TARGET_SECONDS - photoTime) / videos.length)) : 0;
  let slowDone = false;
  const shots: ReelShot[] = usable.map((m, i) => {
    if (!isVideo(m)) return { mediaId: m.id, start: 0, duration: PHOTO_SECONDS, speed: 1 };
    const length = m.durationSec ?? 6;
    // One slow-motion moment, on the second video when there is one.
    const slow = !slowDone && videos.length > 1 && videos.indexOf(m) === 1;
    if (slow) slowDone = true;
    const speed = slow ? 0.6 : 1;
    const duration = round(Math.min(perVideo, length / speed));
    const sourceNeeded = duration * speed;
    // Skip the shaky first moments of a phone clip.
    const start = round(Math.max(0, Math.min(length - sourceNeeded, length * 0.25)));
    return { mediaId: m.id, start, duration, speed, text: i === 0 ? title : undefined };
  });
  if (shots[0] && !shots[0].text) shots[0].text = title;
  return { shots, endCard: true, endText: "Handmade in Knysna", grade: "warm", by: "auto" };
}

export function totalSeconds(sb: Storyboard) {
  return round(sb.shots.reduce((t, s) => t + s.duration, 0) + (sb.endCard ? END_CARD_SECONDS : 0));
}

/** Drops shots whose media was removed from the slot, and clamps silly values. */
export function cleanStoryboard(sb: Storyboard, media: MediaRef[]): Storyboard {
  const ids = new Set(media.map((m) => m.id));
  return {
    ...sb,
    shots: sb.shots
      .filter((s) => ids.has(s.mediaId))
      .map((s) => ({
        ...s,
        start: Math.max(0, Number(s.start) || 0),
        duration: Math.min(15, Math.max(0.5, Number(s.duration) || PHOTO_SECONDS)),
        speed: Math.min(2, Math.max(0.25, Number(s.speed) || 1)),
      })),
  };
}

/* ───────────── ffmpeg jobs ─────────────
 * The same commands run in the browser (ffmpeg.wasm) and, in tests, with the
 * native ffmpeg binary. Each shot is rendered to its own clip, the clips are
 * joined without re-encoding, then music is added (or not).
 */

export interface JobInput {
  /** File name inside ffmpeg's file system. */
  file: string;
  kind: "video" | "image";
}

export interface RenderJob {
  /** Small text files to write before running (on-screen words, concat list). */
  texts: Record<string, string>;
  /** ffmpeg argument lists, run in order. */
  steps: string[][];
  output: string;
  seconds: number;
}

export const FONT_HEADING = "fonts/CormorantGaramond.ttf";
export const FONT_BODY = "fonts/DMSans.ttf";
/** The Roopip wordmark (public/roopip-logo.png), copied in for the end card. */
export const LOGO_FILE = "fonts/roopip-logo.png";

const IVORY = "0xF3F0E9";
const ESPRESSO = "0x332A22";
const CARAMEL = "0xA17A5E";

const GRADES: Record<Storyboard["grade"], string> = {
  // Lift warmth a touch and soften saturation, to sit with the Roopip palette.
  warm: "eq=contrast=1.04:saturation=0.9:gamma=1.02,colorbalance=rs=0.05:gs=0.015:bs=-0.05:rm=0.03:bm=-0.03",
  natural: "eq=contrast=1.02:saturation=0.97",
};

export const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", String(FPS)];

function fmt(n: number) {
  return n.toFixed(3).replace(/\.?0+$/, "");
}

function textFilter(textFile: string, duration: number) {
  const fadeIn = 0.4;
  const fadeOut = Math.max(fadeIn, duration - 0.4);
  return (
    `drawtext=fontfile=${FONT_HEADING}:textfile=${textFile}:fontcolor=${IVORY}:fontsize=86:` +
    `x=(w-text_w)/2:y=h*0.7:shadowcolor=${ESPRESSO}@0.75:shadowx=0:shadowy=4:` +
    `alpha='if(lt(t,${fadeIn}),t/${fadeIn},if(gt(t,${fmt(fadeOut)}),max(0,(${fmt(duration)}-t)/0.4),1))'`
  );
}

/**
 * The music credit a CC BY track asks for: small, light text at the top left,
 * below the area Instagram covers with its own labels, for the last 2 seconds.
 */
export const CREDIT_SECONDS = 2;
export function creditFilter(textFile: string, seconds: number | undefined, color = IVORY) {
  // On footage: a soft espresso label so it reads on light photos. On the ivory end card: plain caramel text.
  const backing = color === IVORY ? `box=1:boxcolor=${ESPRESSO}@0.38:boxborderw=16:` : "";
  const style = `drawtext=fontfile=${FONT_BODY}:textfile=${textFile}:expansion=none:fontcolor=${color}:fontsize=28:x=w*0.06:y=h*0.15:${backing}`;
  // Length unknown: show it for the first 3 seconds instead.
  if (!seconds) return `${style}enable='lt(t,3)':alpha='min(1,t/0.3,(3-t)/0.3)*0.95'`;
  const from = Math.max(0, seconds - CREDIT_SECONDS);
  return `${style}enable='gte(t,${fmt(from)})':alpha='min(1,(t-${fmt(from)})/0.3)*0.95'`;
}

/** Wrap on-screen text to about 18 characters a line so it stays inside the frame. */
export function wrapText(text: string, width = 18) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join("\n");
}

export function buildJob(sb: Storyboard, inputs: Record<string, JobInput>, music?: string, credit?: string): RenderJob {
  const texts: Record<string, string> = {};
  const steps: string[][] = [];
  const parts: string[] = [];
  const shots = sb.shots.filter((s) => inputs[s.mediaId]);
  if (!shots.length) throw new Error("Add at least one photo or video to the storyboard.");

  shots.forEach((shot, i) => {
    const input = inputs[shot.mediaId];
    const out = `part${i}.mp4`;
    const filters: string[] = [];
    let inArgs: string[];
    if (input.kind === "video") {
      const speed = shot.speed || 1;
      inArgs = ["-ss", fmt(shot.start), "-t", fmt(shot.duration * speed + 0.1), "-i", input.file];
      if (speed !== 1) filters.push(`setpts=PTS/${fmt(speed)}`);
      filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, "setsar=1", `fps=${FPS}`);
    } else {
      // A slow push-in on stills: render 20% larger and zoom to 8%.
      const frames = Math.round(shot.duration * FPS);
      inArgs = ["-loop", "1", "-framerate", String(FPS), "-t", fmt(shot.duration), "-i", input.file];
      filters.push(
        `scale=${W * 1.2}:${H * 1.2}:force_original_aspect_ratio=increase`,
        `crop=${W * 1.2}:${H * 1.2}`,
        `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`,
        "setsar=1",
      );
    }
    filters.push(GRADES[sb.grade] ?? GRADES.warm);
    if (i === 0) filters.push("fade=t=in:st=0:d=0.4");
    if (shot.text?.trim()) {
      const tf = `text${i}.txt`;
      texts[tf] = wrapText(shot.text);
      filters.push(textFilter(tf, shot.duration));
    }
    filters.push("format=yuv420p");
    steps.push(["-y", ...inArgs, "-an", "-vf", filters.join(","), "-t", fmt(shot.duration), ...ENCODE, out]);
    parts.push(out);
  });

  if (sb.endCard) {
    const d = END_CARD_SECONDS;
    texts["endsub.txt"] = (sb.endText ?? "Handmade in Knysna").trim() || " ";
    // The real Roopip wordmark, centred on warm ivory, with the line under it.
    const fc = [
      `[1:v]scale=760:-1,format=rgba[logo]`,
      `[0:v][logo]overlay=(W-w)/2:(H-h)/2-90:shortest=1,` +
        `drawtext=fontfile=${FONT_BODY}:textfile=endsub.txt:fontcolor=${CARAMEL}:fontsize=44:x=(w-text_w)/2:y=h/2+70,` +
        // The music credit sits on the end card, small and caramel, when there is one.
        (music && credit ? `${creditFilter("credit.txt", d, CARAMEL)},` : "") +
        `fade=t=in:st=0:d=0.5,fade=t=out:st=${fmt(d - 0.6)}:d=0.6,format=yuv420p[v]`,
    ].join(";");
    steps.push([
      "-y", "-f", "lavfi", "-i", `color=c=${IVORY}:s=${W}x${H}:r=${FPS}:d=${d}`,
      "-loop", "1", "-i", LOGO_FILE,
      "-filter_complex", fc, "-map", "[v]", "-t", fmt(d), ...ENCODE, "end.mp4",
    ]);
    parts.push("end.mp4");
  }

  texts["list.txt"] = parts.map((p) => `file '${p}'`).join("\n") + "\n";
  steps.push(["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"]);

  const seconds = totalSeconds({ ...sb, shots });
  if (music) {
    if (credit) texts["credit.txt"] = credit;
    // Without an end card, the credit goes over the last shot, so the video is encoded again.
    const video = credit && !sb.endCard ? ["-vf", `${creditFilter("credit.txt", seconds)},format=yuv420p`, ...ENCODE] : ["-c:v", "copy"];
    steps.push([
      "-y", "-i", "joined.mp4", "-i", music,
      "-map", "0:v", "-map", "1:a", ...video, "-c:a", "aac", "-b:a", "160k",
      "-af", `afade=t=in:d=0.5,afade=t=out:st=${fmt(Math.max(0, seconds - 1.5))}:d=1.5`,
      "-t", fmt(seconds), "-movflags", "+faststart", "reel.mp4",
    ]);
  } else {
    steps.push(["-y", "-i", "joined.mp4", "-c", "copy", "-movflags", "+faststart", "reel.mp4"]);
  }
  return { texts, steps, output: "reel.mp4", seconds };
}
