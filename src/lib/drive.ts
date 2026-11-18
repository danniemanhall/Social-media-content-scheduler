import type { MediaRef } from "./types";

/**
 * Google Drive browsing with Google Identity Services. Needs
 * VITE_GOOGLE_CLIENT_ID (see README). The app reads Drive, and only writes the
 * reels it renders, into a "Roopip reels" folder (drive.file scope: it can
 * only see or change files it created itself).
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file";

export const driveConfigured = !!CLIENT_ID;

export interface DriveItem extends MediaRef {
  isFolder: boolean;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
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
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }): TokenClient;
          hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
        };
      };
    };
  }
}

let token: { value: string; expires: number } | null = null;
let chosenOnce = false;

const ALLOWED_HINT =
  "Choose carli@roopip.co.za on the Google pop-up. Other Google accounts are blocked until they are added as test users in Google Cloud (Google Auth Platform, then Audience, then Test users).";

/** Turns Google's sign-in errors into something a person can act on. */
export function signInMessage(error: string | undefined): string {
  switch (error) {
    case "access_denied":
      return `Google refused this account. ${ALLOWED_HINT}`;
    case "popup_closed":
    case "popup_closed_by_user":
      return "The Google pop-up was closed before it finished. Try again.";
    case "popup_failed_to_open":
      return "The browser blocked the Google pop-up. Allow pop-ups for this site and try again.";
    case "missing_scopes":
      return "Drive wasn't fully allowed. Try again, and tick both Google Drive boxes on the Google pop-up.";
    default:
      return error ? `Google sign-in failed (${error}). ${ALLOWED_HINT}` : "Sign-in was cancelled.";
  }
}

/** Turns a failed Drive request into a plain message. */
export function driveMessage(status: number, body: string): string {
  if (status === 401) {
    token = null;
    return "The Google sign-in has expired. Connect Google Drive again.";
  }
  if (status === 403)
    return /insufficient|scope/i.test(body)
      ? "Drive wasn't fully allowed. Disconnect and connect again, and tick both Google Drive boxes on the Google pop-up."
      : `Google Drive denied access. The signed-in account can't open this folder or file. ${ALLOWED_HINT}`;
  if (status === 404) return `Drive can't find this folder or file with the signed-in account. ${ALLOWED_HINT}`;
  return `Drive said ${status}: ${body.slice(0, 200)}`;
}

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

/** Forgets the sign-in, so the next connect asks for an account again. */
export function disconnectDrive() {
  token = null;
  chosenOnce = false;
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
        if (r.error || !r.access_token) return reject(new Error(signInMessage(r.error)));
        const oauth2 = window.google!.accounts.oauth2;
        if (!oauth2.hasGrantedAllScopes(r, ...SCOPE.split(" "))) return reject(new Error(signInMessage("missing_scopes")));
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000 };
        chosenOnce = true;
        resolve();
      },
      error_callback: (e) => reject(new Error(signInMessage(e.type))),
    });
    // The first time in each visit, always show the account picker, so the
    // browser's default Google account isn't used by accident.
    client.requestAccessToken({ prompt: chosenOnce ? "" : "select_account" });
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
  const thumbnail = f.thumbnailLink?.replace(/=s\d+$/, "=s400");
  if (thumbnail) thumbCache.set(f.id, { url: thumbnail, at: Date.now() });
  return {
    id: f.id,
    source: "drive",
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === FOLDER,
    thumbnail,
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
    if (!res.ok) throw new Error(driveMessage(res.status, await res.text()));
    const body = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    items.push(...body.files.map(toItem));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return items;
}

async function authed(url: string, init: RequestInit = {}) {
  await connectDrive();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token!.value}` } });
  if (!res.ok) throw new Error(driveMessage(res.status, await res.text()));
  return res;
}

const thumbCache = new Map<string, { url: string | null; at: number }>();
const THUMB_TTL = 50 * 60 * 1000;

/**
 * A current thumbnail link for a Drive file. Drive's thumbnail links stop
 * working after a few hours, so links saved by an earlier scan can't be
 * trusted; this asks Drive for a fresh one (cached for 50 minutes).
 */
export async function freshThumbnail(fileId: string): Promise<string | null> {
  const hit = thumbCache.get(fileId);
  if (hit && Date.now() - hit.at < THUMB_TTL) return hit.url;
  if (!driveConnected()) return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token!.value}` } },
  );
  const url = res.ok ? (((await res.json()) as { thumbnailLink?: string }).thumbnailLink?.replace(/=s\d+$/, "=s400") ?? null) : null;
  thumbCache.set(fileId, { url, at: Date.now() });
  return url;
}

/** Downloads a Drive file's contents, for rendering. */
export async function downloadFile(fileId: string): Promise<Blob> {
  const res = await authed(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  return res.blob();
}

export const REELS_FOLDER = "Roopip reels";
export const CANVA_FOLDER = "Roopip Canva designs";

async function appFolder(folderName: string): Promise<string> {
  const q = `name = '${folderName}' and mimeType = '${FOLDER}' and trashed = false`;
  const found = (await (await authed(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)" })}`)).json()) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = (await (
    await authed("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: folderName, mimeType: FOLDER }),
    })
  ).json()) as { id: string };
  return made.id;
}

/** Saves a finished reel to the "Roopip reels" folder in the signed-in person's Drive. */
export async function saveReel(name: string, video: Blob): Promise<{ id: string; link: string }> {
  const saved = await saveToAppFolder(REELS_FOLDER, name, video, "video/mp4");
  return { id: saved.id, link: saved.link! };
}

/** Uploads a file into one of the app's own Drive folders and returns it as media. */
export async function saveToAppFolder(folderName: string, name: string, file: Blob, mimeType: string): Promise<DriveItem> {
  const parent = await appFolder(folderName);
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name, parents: [parent], mimeType })], { type: "application/json" }));
  form.append("file", file, name);
  const res = await authed(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,thumbnailLink,webViewLink,imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height,durationMillis)",
    { method: "POST", body: form },
  );
  return toItem((await res.json()) as DriveFile);
}
