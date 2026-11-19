import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { buildJob, isVideo, type JobInput, FONT_BODY, FONT_HEADING, LOGO_FILE } from "./reel";
import { downloadFile } from "./drive";
import { BROLL_MOVES, BROLL_SECONDS, framesArgs, joinArgs, type BrollMove, type BrollShot, type Framing } from "./broll";
import { getFile } from "./localMedia";
import type { MediaRef, Storyboard } from "./types";

/**
 * Renders a storyboard to an MP4 in the browser with ffmpeg.wasm. The 32 MB
 * ffmpeg core is too big for Cloudflare Pages, so it loads from a CDN the
 * first time someone renders, and the browser caches it after that.
 */
const CORE_BASE = (import.meta.env.VITE_FFMPEG_CORE_BASE as string | undefined) ?? "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let loaded: Promise<FFmpeg> | null = null;

function getFFmpeg(): Promise<FFmpeg> {
  loaded ??= (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    await ff.createDir("fonts");
    await ff.writeFile(FONT_HEADING, await fetchFile("/fonts/CormorantGaramond.ttf"));
    await ff.writeFile(FONT_BODY, await fetchFile("/fonts/DMSans.ttf"));
    await ff.writeFile(LOGO_FILE, await fetchFile("/roopip-logo.png"));
    return ff;
  })().catch((e) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

export interface Progress {
  /** 0 to 1 */
  value: number;
  label: string;
}

async function blobFor(m: MediaRef): Promise<Blob> {
  if (m.source === "drive") return downloadFile(m.id);
  const b = await getFile(m.id);
  if (!b) throw new Error(`"${m.name}" was added on another device. Open this post there to render, or add the file from Drive.`);
  return b;
}

const ext = (m: MediaRef) => (m.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? (isVideo(m) ? ".mp4" : ".jpg")).toLowerCase();

export async function renderReel(
  sb: Storyboard,
  media: MediaRef[],
  music: Blob | null,
  onProgress: (p: Progress) => void,
): Promise<{ video: Blob; seconds: number }> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();

  const used = media.filter((m) => sb.shots.some((s) => s.mediaId === m.id));
  const blobs: { name: string; data: Blob }[] = [];
  const inputs: Record<string, JobInput> = {};
  for (const [i, m] of used.entries()) {
    onProgress({ value: 0.02 + (0.18 * i) / used.length, label: `Fetching ${m.name}…` });
    const name = `m${i}${ext(m)}`;
    blobs.push({ name, data: await blobFor(m) });
    inputs[m.id] = { file: `/in/${name}`, kind: isVideo(m) ? "video" : "image" };
  }
  if (music) blobs.push({ name: "music.audio", data: music });

  // Mount instead of copying, so long phone clips don't fill the browser's memory.
  await ff.createDir("/in").catch(() => undefined);
  await ff.mount(FFFSType.WORKERFS, { blobs }, "/in");
  try {
    const job = buildJob(sb, inputs, music ? "/in/music.audio" : undefined);
    for (const [name, text] of Object.entries(job.texts)) await ff.writeFile(name, text);
    const logs: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      logs.push(message);
      if (logs.length > 40) logs.shift();
    };
    ff.on("log", onLog);
    try {
      for (const [i, step] of job.steps.entries()) {
        const what = i < sb.shots.length ? `Cutting shot ${i + 1} of ${sb.shots.length}` : i === job.steps.length - 1 ? "Finishing" : "Joining";
        onProgress({ value: 0.2 + (0.78 * i) / job.steps.length, label: `${what}…` });
        const code = await ff.exec(step);
        if (code !== 0) throw new Error(`The video engine stopped (${what.toLowerCase()}). ${logs.slice(-3).join(" ")}`);
      }
    } finally {
      ff.off("log", onLog);
    }
    const data = (await ff.readFile(job.output)) as Uint8Array;
    for (const f of ["joined.mp4", job.output, ...job.steps.map((s) => s.at(-1)!)]) await ff.deleteFile(f).catch(() => undefined);
    onProgress({ value: 1, label: "Done" });
    return { video: new Blob([data], { type: "video/mp4" }), seconds: job.seconds };
  } finally {
    await ff.unmount("/in").catch(() => undefined);
  }
}

/** Films one B-roll shot of a decoded photo into an MP4 inside ffmpeg's file system. */
async function filmToFile(
  ff: FFmpeg,
  bmp: ImageBitmap,
  shot: { move: BrollMove; seconds: number; dir: 1 | -1; framing: Framing },
  out: string,
  logs: string[],
  onFrame?: (done: number, total: number) => void,
) {
  const { filmShot } = await import("./brollRender");
  const names: string[] = [];
  try {
    await filmShot(bmp, shot, async (jpeg, i, total) => {
      const name = `bf-${String(i + 1).padStart(5, "0")}.jpg`;
      await ff.writeFile(name, jpeg);
      names.push(name);
      onFrame?.(i + 1, total);
    });
    const code = await ff.exec(framesArgs("bf-%05d.jpg", out));
    if (code !== 0) throw new Error(`The video engine stopped on "${BROLL_MOVES[shot.move].label}". ${logs.slice(-3).join(" ")}`);
  } finally {
    for (const n of names) await ff.deleteFile(n).catch(() => undefined);
  }
}

function collectLogs(ff: FFmpeg) {
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  ff.on("log", onLog);
  return { logs, stop: () => ff.off("log", onLog) };
}

/**
 * Turns one photo into short B-roll clips, one per camera move. The photo's
 * pixels and colours are left as they are; only the framing moves.
 */
export async function renderBroll(photo: MediaRef, moves: BrollMove[], onProgress: (p: Progress) => void): Promise<{ move: BrollMove; video: Blob }[]> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();
  onProgress({ value: 0.05, label: `Fetching ${photo.name}…` });
  const { loadPhoto, findFraming } = await import("./brollRender");
  const bmp = await loadPhoto(await blobFor(photo));
  const framing = findFraming(bmp);
  const out: { move: BrollMove; video: Blob }[] = [];
  const { logs, stop } = collectLogs(ff);
  try {
    for (const [i, move] of moves.entries()) {
      const base = 0.08 + (0.9 * i) / moves.length;
      const label = `Filming "${BROLL_MOVES[move].label.toLowerCase()}" (${i + 1} of ${moves.length})…`;
      onProgress({ value: base, label });
      const file = `broll-${move}.mp4`;
      await filmToFile(ff, bmp, { move, seconds: BROLL_SECONDS, dir: i % 2 ? -1 : 1, framing }, file, logs, (d, n) => onProgress({ value: base + (0.6 * d * 0.9) / n / moves.length, label }));
      onProgress({ value: base + 0.6 * (0.9 / moves.length), label: `Saving "${BROLL_MOVES[move].label.toLowerCase()}"…` });
      const data = (await ff.readFile(file)) as Uint8Array;
      out.push({ move, video: new Blob([data], { type: "video/mp4" }) });
      await ff.deleteFile(file).catch(() => undefined);
    }
  } finally {
    stop();
    bmp.close();
  }
  onProgress({ value: 1, label: "Done" });
  return out;
}

/**
 * One B-roll video for a post: a slow, smooth slide across each photo, each
 * one going the opposite way to the last, joined with straight cuts. Silent,
 * 1080 x 1920.
 */
export async function renderBrollVideo(shots: BrollShot<MediaRef>[], onProgress: (p: Progress) => void): Promise<Blob> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();
  const { loadPhoto, findFraming } = await import("./brollRender");
  const { logs, stop } = collectLogs(ff);
  const files: string[] = [];
  try {
    for (const [i, shot] of shots.entries()) {
      const step = 0.92 / shots.length;
      const at = (f: number) => 0.03 + step * (i + f);
      onProgress({ value: at(0), label: `Fetching photo ${i + 1} of ${shots.length}…` });
      const bmp = await loadPhoto(await blobFor(shot.photo));
      try {
        const seen = findFraming(bmp);
        const framing = { ...seen, busy: shot.busy ?? seen.busy };
        const label = `Filming shot ${i + 1} of ${shots.length} (${framing.busy ? "close" : "wide"}, ${shot.dir > 0 ? "left to right" : "right to left"})…`;
        const out = `bv-${i}.mp4`;
        await filmToFile(ff, bmp, { move: shot.move, seconds: shot.seconds, dir: shot.dir, framing }, out, logs, (d, n) => onProgress({ value: at(0.1 + 0.7 * (d / n)), label }));
        files.push(out);
      } finally {
        bmp.close();
      }
    }
    onProgress({ value: 0.96, label: "Joining the shots…" });
    await ff.writeFile("bv-list.txt", new TextEncoder().encode(files.map((f) => `file '${f}'`).join("\n")));
    const code = await ff.exec(joinArgs("bv-list.txt", "bv-final.mp4"));
    if (code !== 0) throw new Error(`Couldn't join the shots. ${logs.slice(-3).join(" ")}`);
    const data = (await ff.readFile("bv-final.mp4")) as Uint8Array;
    onProgress({ value: 1, label: "Done" });
    return new Blob([data], { type: "video/mp4" });
  } finally {
    stop();
    for (const f of [...files, "bv-list.txt", "bv-final.mp4"]) await ff.deleteFile(f).catch(() => undefined);
  }
}

/**
 * Bakes a music track into a finished video (a B-roll video, a Canva video or
 * a reel), fading in and out, so Instagram gets one file with sound and the
 * post can go out automatically.
 */
export async function addMusic(video: MediaRef, track: Blob, onProgress: (p: Progress) => void): Promise<Blob> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();
  onProgress({ value: 0.2, label: "Fetching the video and the music…" });
  const blobs = [
    { name: "v.mp4", data: await blobFor(video) },
    { name: "music.audio", data: track },
  ];
  await ff.createDir("/mx").catch(() => undefined);
  await ff.mount(FFFSType.WORKERFS, { blobs }, "/mx");
  try {
    const seconds = video.durationSec ?? 30;
    onProgress({ value: 0.5, label: "Adding the music…" });
    const code = await ff.exec([
      "-y", "-i", "/mx/v.mp4", "-i", "/mx/music.audio",
      "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
      "-af", `afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, seconds - 1.5).toFixed(2)}:d=1.5`,
      "-shortest", "-movflags", "+faststart", "with-music.mp4",
    ]);
    if (code !== 0) throw new Error("Couldn't add the music to the video.");
    const data = (await ff.readFile("with-music.mp4")) as Uint8Array;
    await ff.deleteFile("with-music.mp4").catch(() => undefined);
    onProgress({ value: 1, label: "Done" });
    return new Blob([data], { type: "video/mp4" });
  } finally {
    await ff.unmount("/mx").catch(() => undefined);
  }
}
