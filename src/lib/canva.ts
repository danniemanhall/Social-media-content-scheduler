import { CANVA_FOLDER, connectDrive, saveToAppFolder } from "./drive";
import type { MediaRef, Slot } from "./types";

/** Talks to the server's Canva connection (server/canva.ts). */

export interface CanvaStatus {
  configured: boolean;
  connected: boolean;
  name?: string | null;
}

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  pages?: number;
  updated?: number;
  editUrl?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/canva/${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error === "not-connected" ? "Canva isn't connected." : (body.error ?? `Canva request failed (${res.status})`));
  return body;
}

export async function canvaStatus(): Promise<CanvaStatus> {
  try {
    return await api<CanvaStatus>("status");
  } catch {
    return { configured: false, connected: false };
  }
}

/** Opens Canva's sign-in in a pop-up and resolves once it's done. */
export function connectCanva(): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window.open("/api/canva/start", "roopip-canva", "width=520,height=720");
    if (!win) return reject(new Error("The pop-up was blocked. Allow pop-ups for this site and try again."));
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as { type?: string })?.type !== "roopip-canva") return;
      cleanup();
      const d = e.data as { ok: boolean; error?: string };
      if (d.ok) resolve();
      else reject(new Error(d.error || "Canva didn't connect."));
    };
    const timer = setInterval(() => {
      if (win.closed) {
        cleanup();
        void canvaStatus().then((s) => (s.connected ? resolve() : reject(new Error("The Canva window was closed before it connected."))));
      }
    }, 800);
    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      clearInterval(timer);
    };
    window.addEventListener("message", onMsg);
  });
}

export function listDesigns(query: string, continuation?: string | null) {
  const q = new URLSearchParams();
  if (query) q.set("query", query);
  if (continuation) q.set("continuation", continuation);
  return api<{ designs: CanvaDesign[]; continuation: string | null }>(`designs?${q}`);
}

/** How a design's shape compares with what the post needs. */
export function shapeNote(d: Pick<CanvaDesign, "width" | "height">, format: Slot["format"]): { ok: boolean; text: string } | null {
  if (!d.width || !d.height) return null;
  const want = format === "story" || format === "reel" ? 9 / 16 : 4 / 5;
  const r = d.width / d.height;
  if (Math.abs(r - want) / want < 0.03) return { ok: true, text: format === "story" || format === "reel" ? "9:16, the right size" : "4:5, the right size" };
  return { ok: false, text: `Not ${format === "story" || format === "reel" ? "9:16" : "4:5"}, so it will be cropped to fit` };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Exports a design (every page) and saves the files to the "Roopip Canva
 * designs" folder in Drive, ready to use on the post.
 */
export async function pullDesign(design: CanvaDesign, slot: Slot, video: boolean, onStep: (s: string) => void): Promise<MediaRef[]> {
  onStep("Asking Canva to export the design…");
  const job = await api<{ id: string; status: string }>("export", { method: "POST", body: JSON.stringify({ designId: design.id, kind: video ? "mp4" : "jpg" }) });
  let urls: string[] = [];
  for (let i = 0; i < 90; i++) {
    const s = await api<{ status: string; urls: string[]; error?: string }>(`export/${job.id}`);
    if (s.status === "success") {
      urls = s.urls;
      break;
    }
    if (s.status === "failed") throw new Error(s.error ?? "Canva couldn't export the design.");
    onStep(`Canva is exporting${video ? " the video" : ""}…`);
    await sleep(i < 5 ? 1000 : 2000);
  }
  if (!urls.length) throw new Error("Canva took too long to export. Try again in a minute.");

  onStep("Connecting Google Drive…");
  await connectDrive();
  const out: MediaRef[] = [];
  for (const [i, url] of urls.entries()) {
    onStep(`Saving ${urls.length > 1 ? `page ${i + 1} of ${urls.length}` : "the design"} to Drive…`);
    const res = await fetch(`/api/canva-file?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Couldn't download the export from Canva (${res.status}).`);
    const blob = await res.blob();
    const name = `${slot.date} ${design.title.slice(0, 40)}${urls.length > 1 ? ` ${i + 1}` : ""}.${video ? "mp4" : "jpg"}`.replace(/[\\/:*?"<>|]/g, "-");
    const { isFolder: _f, ...ref } = await saveToAppFolder(CANVA_FOLDER, name, blob, video ? "video/mp4" : "image/jpeg");
    out.push(ref);
  }
  return out;
}
