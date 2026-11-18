import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "./brand";
import { analysePixels, type IndexedMedia, type Look } from "./brandFit";
import { downloadFile, driveConnected, listFolder } from "./drive";
import { getFile } from "./localMedia";
import type { Store } from "./store";
import type { MediaRef } from "./types";

/**
 * The media "brain": which Drive folders the app draws from, a list of every
 * photo and video in them, and each one's colour look for brand-fit checks.
 * All three are shared settings, so the work is done once for everyone.
 */

export interface MediaFolder {
  id: string;
  name: string;
}

export const DEFAULT_FOLDERS: MediaFolder[] = [
  { id: BRAND.links.driveProductPhotos, name: "Product Photos" },
  { id: BRAND.links.driveBrandAssets, name: "Brand Assets" },
];

const FOLDERS_KEY = "mediaFolders";
const INDEX_KEY = "mediaIndex";
const LOOKS_KEY = "mediaLooks";
const MAX_DEPTH = 4;
/** Files bigger than this aren't downloaded just to read their colours. */
const MAX_ANALYSE_BYTES = 25 * 1024 * 1024;

export interface MediaIndex {
  at: string;
  items: IndexedMedia[];
}

/** Pulls a Drive folder id out of a pasted link, or returns null. */
export function folderIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  if (/^[\w-]{20,}$/.test(s)) return s;
  return null;
}

export function isGooglePhotosLink(input: string) {
  return /photos\.google\.com|photos\.app\.goo\.gl/.test(input);
}

async function walk(folder: MediaFolder, path: string, depth: number, out: IndexedMedia[]) {
  const items = await listFolder(folder.id);
  for (const it of items) {
    const { isFolder, ...ref } = it;
    if (isFolder) {
      if (depth < MAX_DEPTH) await walk({ id: it.id, name: it.name }, `${path}/${it.name}`, depth + 1, out);
    } else out.push({ ...ref, path });
  }
}

/** Reads an image blob's colours from a 64x64 copy. */
async function lookOfBlob(blob: Blob): Promise<Look> {
  const bmp = await createImageBitmap(blob, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "medium" });
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return analysePixels(ctx.getImageData(0, 0, 64, 64).data);
}

/** First frame of a video blob, as a look. */
async function lookOfVideo(blob: Blob): Promise<Look> {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("Can't read this video"));
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise<void>((res) => (v.onseeked = () => res()));
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, 64, 64);
    return analysePixels(ctx.getImageData(0, 0, 64, 64).data);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Works out one file's look, trying the small Drive thumbnail before the full file. */
export async function readLook(m: MediaRef & { size?: number }): Promise<Look | null> {
  if (m.source === "local") {
    const blob = await getFile(m.id);
    if (!blob) return null;
    return blob.type.startsWith("video/") ? lookOfVideo(blob) : lookOfBlob(blob);
  }
  if (m.thumbnail) {
    try {
      const res = await fetch(m.thumbnail, { mode: "cors", credentials: "omit" });
      if (res.ok) return await lookOfBlob(await res.blob());
    } catch {
      /* thumbnails don't always allow this; fall back to the file itself */
    }
  }
  if (!driveConnected()) return null;
  if (m.mimeType.startsWith("video/")) return null; // too big to download just for colours
  if (m.size && m.size > MAX_ANALYSE_BYTES) return null;
  return lookOfBlob(await downloadFile(m.id));
}

export interface MediaLibraryState {
  folders: MediaFolder[];
  index: MediaIndex | null;
  looks: Record<string, Look>;
  /** Short progress note while scanning or reading colours. */
  progress: string | null;
  error: string | null;
  setFolders(f: MediaFolder[]): Promise<void>;
  /** Re-lists every folder, then reads the colours of anything new. Needs Drive connected. */
  refresh(): Promise<void>;
  /** The look of one file, reading and saving it if it's new. */
  lookFor(m: MediaRef): Promise<Look | null>;
}

export function useMediaLibrary(store: Store): MediaLibraryState {
  const [folders, setFoldersState] = useState<MediaFolder[]>(DEFAULT_FOLDERS);
  const [index, setIndex] = useState<MediaIndex | null>(null);
  const [looks, setLooks] = useState<Record<string, Look>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const looksRef = useRef(looks);
  looksRef.current = looks;
  const running = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const [f, i, l] = await Promise.all([
          store.getSetting<MediaFolder[]>(FOLDERS_KEY),
          store.getSetting<MediaIndex>(INDEX_KEY),
          store.getSetting<Record<string, Look>>(LOOKS_KEY),
        ]);
        if (f?.length) setFoldersState(f);
        if (i) setIndex(i);
        if (l) setLooks(l);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [store]);

  const saveLooks = useCallback(
    async (next: Record<string, Look>) => {
      setLooks(next);
      // Merge with what others saved meanwhile, so two people don't undo each other.
      const current = (await store.getSetting<Record<string, Look>>(LOOKS_KEY)) ?? {};
      await store.setSetting(LOOKS_KEY, { ...current, ...next });
    },
    [store],
  );

  const setFolders = useCallback(
    async (f: MediaFolder[]) => {
      setFoldersState(f);
      await store.setSetting(FOLDERS_KEY, f);
    },
    [store],
  );

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      const items: IndexedMedia[] = [];
      for (const f of folders) {
        setProgress(`Listing ${f.name}…`);
        await walk(f, f.name, 1, items);
      }
      const seen = new Set<string>();
      const unique = items.filter((m) => !seen.has(m.id) && seen.add(m.id));
      const next: MediaIndex = { at: new Date().toISOString(), items: unique };
      setIndex(next);
      await store.setSetting(INDEX_KEY, next);

      const todo = unique.filter((m) => !looksRef.current[m.id] && (m.mimeType.startsWith("image/") || !!m.thumbnail));
      const found: Record<string, Look> = {};
      let done = 0;
      for (const m of todo) {
        setProgress(`Checking colours ${++done} of ${todo.length}…`);
        try {
          const look = await readLook(m);
          if (look) found[m.id] = look;
        } catch {
          /* skip files that can't be read */
        }
        if (done % 20 === 0 && Object.keys(found).length) await saveLooks({ ...looksRef.current, ...found });
      }
      if (Object.keys(found).length) await saveLooks({ ...looksRef.current, ...found });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setProgress(null);
    }
  }, [folders, store, saveLooks]);

  const lookFor = useCallback(
    async (m: MediaRef) => {
      const known = looksRef.current[m.id];
      if (known) return known;
      try {
        const look = await readLook(m);
        if (look) await saveLooks({ ...looksRef.current, [m.id]: look });
        return look;
      } catch {
        return null;
      }
    },
    [saveLooks],
  );

  return { folders, index, looks, progress, error, setFolders, refresh, lookFor };
}
