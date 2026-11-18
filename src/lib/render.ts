import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { buildJob, isVideo, type JobInput, FONT_BODY, FONT_HEADING, LOGO_FILE } from "./reel";
import { downloadFile } from "./drive";
import { BROLL_MOVES, BROLL_VIDEO_SHOT, brollArgs, joinArgs, type BrollMove } from "./broll";
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

/**
 * Turns one photo into short B-roll clips, one per camera move. The photo's
 * pixels and colours are left as they are; only the framing moves.
 */
export async function renderBroll(photo: MediaRef, moves: BrollMove[], onProgress: (p: Progress) => void): Promise<{ move: BrollMove; video: Blob }[]> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();
  onProgress({ value: 0.05, label: `Fetching ${photo.name}…` });
  const input = `broll-in${ext(photo)}`;
  await ff.writeFile(input, new Uint8Array(await (await blobFor(photo)).arrayBuffer()));
  const out: { move: BrollMove; video: Blob }[] = [];
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  ff.on("log", onLog);
  try {
    for (const [i, move] of moves.entries()) {
      onProgress({ value: 0.08 + (0.9 * i) / moves.length, label: `Filming "${BROLL_MOVES[move].label.toLowerCase()}" (${i + 1} of ${moves.length})…` });
      const file = `broll-${move}.mp4`;
      const code = await ff.exec(brollArgs(input, move, file));
      if (code !== 0) throw new Error(`The video engine stopped on "${BROLL_MOVES[move].label}". ${logs.slice(-3).join(" ")}`);
      const data = (await ff.readFile(file)) as Uint8Array;
      out.push({ move, video: new Blob([data], { type: "video/mp4" }) });
      await ff.deleteFile(file).catch(() => undefined);
    }
  } finally {
    ff.off("log", onLog);
    await ff.deleteFile(input).catch(() => undefined);
  }
  onProgress({ value: 1, label: "Done" });
  return out;
}

/**
 * One B-roll video for a post: a short handheld-style shot of each photo, in
 * order, joined with straight cuts like real footage. Silent, 1080 x 1920.
 */
export async function renderBrollVideo(shots: { photo: MediaRef; move: BrollMove }[], onProgress: (p: Progress) => void): Promise<Blob> {
  onProgress({ value: 0, label: "Loading the video engine (first time takes a moment)…" });
  const ff = await getFFmpeg();
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  ff.on("log", onLog);
  const files: string[] = [];
  try {
    for (const [i, { photo, move }] of shots.entries()) {
      const step = 0.92 / shots.length;
      onProgress({ value: 0.03 + step * i, label: `Fetching photo ${i + 1} of ${shots.length}…` });
      const input = `bv-in-${i}${ext(photo)}`;
      await ff.writeFile(input, new Uint8Array(await (await blobFor(photo)).arrayBuffer()));
      onProgress({ value: 0.03 + step * (i + 0.2), label: `Filming shot ${i + 1} of ${shots.length} (${BROLL_MOVES[move].label.toLowerCase()})…` });
      const out = `bv-${i}.mp4`;
      const code = await ff.exec(brollArgs(input, move, out, BROLL_VIDEO_SHOT));
      await ff.deleteFile(input).catch(() => undefined);
      if (code !== 0) throw new Error(`The video engine stopped on ${photo.name}. ${logs.slice(-3).join(" ")}`);
      files.push(out);
    }
    onProgress({ value: 0.96, label: "Joining the shots…" });
    await ff.writeFile("bv-list.txt", new TextEncoder().encode(files.map((f) => `file '${f}'`).join("\n")));
    const code = await ff.exec(joinArgs("bv-list.txt", "bv-final.mp4"));
    if (code !== 0) throw new Error(`Couldn't join the shots. ${logs.slice(-3).join(" ")}`);
    const data = (await ff.readFile("bv-final.mp4")) as Uint8Array;
    onProgress({ value: 1, label: "Done" });
    return new Blob([data], { type: "video/mp4" });
  } finally {
    ff.off("log", onLog);
    for (const f of [...files, "bv-list.txt", "bv-final.mp4"]) await ff.deleteFile(f).catch(() => undefined);
  }
}
