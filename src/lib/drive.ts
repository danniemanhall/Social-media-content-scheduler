import type { MediaRef } from "./types";

/**
 * Google Drive browsing with Google Identity Services. Needs
 * VITE_GOOGLE_CLIENT_ID (see README). Read-only: the app never changes Drive.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export const driveConfigured = !!CLIENT_ID;

export interface DriveItem extends MediaRef {
  isFolder: boolean;
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let token: { value: string; expires: number } | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(s);
  });
}

export function driveConnected() {
  return !!token && token.expires > Date.now();
}

export async function connectDrive(): Promise<void> {
  if (!CLIENT_ID) throw new Error("Google Drive isn't set up yet (VITE_GOOGLE_CLIENT_ID missing).");
  if (driveConnected()) return;
  await loadScript();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error ?? "Sign-in cancelled"));
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000 };
        resolve();
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  imageMediaMetadata?: { width?: number; height?: number; rotation?: number };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

const FOLDER = "application/vnd.google-apps.folder";

function toItem(f: DriveFile): DriveItem {
  const img = f.imageMediaMetadata;
  const vid = f.videoMediaMetadata;
  const rotated = img?.rotation === 1 || img?.rotation === 3;
  return {
    id: f.id,
    source: "drive",
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === FOLDER,
    thumbnail: f.thumbnailLink?.replace(/=s\d+$/, "=s400"),
    link: f.webViewLink,
    width: (rotated ? img?.height : img?.width) ?? vid?.width,
    height: (rotated ? img?.width : img?.height) ?? vid?.height,
    durationSec: vid?.durationMillis ? Math.round(Number(vid.durationMillis) / 1000) : undefined,
  };
}

/** Lists folders, images and videos directly inside a Drive folder. */
export async function listFolder(folderId: string): Promise<DriveItem[]> {
  await connectDrive();
  const items: DriveItem[] = [];
  let pageToken = "";
  do {
    const q = `'${folderId}' in parents and trashed = false and (mimeType = '${FOLDER}' or mimeType contains 'image/' or mimeType contains 'video/')`;
    const params = new URLSearchParams({
      q,
      pageSize: "200",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields:
        "nextPageToken, files(id, name, mimeType, thumbnailLink, webViewLink, imageMediaMetadata(width, height, rotation), videoMediaMetadata(width, height, durationMillis))",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${token!.value}` },
    });
    if (!res.ok) throw new Error(`Drive said ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    items.push(...body.files.map(toItem));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return items;
}
