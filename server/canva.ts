/**
 * Roopip's Canva account, connected once through Canva's Connect API so the
 * post flow can list designs and pull one in at the right size, there and
 * then (no waiting for Claude's next run).
 *
 * Someone signs in to Canva once (as the Roopip account). Canva gives the
 * server a refresh token, kept in D1 under a `secret:` key the browser can't
 * read. Canva's refresh tokens are single-use, so every refresh stores the
 * new one straight away.
 *
 * Needs CANVA_CLIENT_ID (wrangler.toml) and the CANVA_CLIENT_SECRET secret
 * (Cloudflare dashboard). Setup steps: docs/canva-setup.md.
 */

export const CANVA_KEY = "secret:canva";
const PENDING_KEY = "secret:canva-pending";
export const CANVA_SCOPES = ["design:meta:read", "design:content:read", "profile:read"];
const API = "https://api.canva.com/rest/v1";
const AUTHORIZE = "https://www.canva.com/api/oauth/authorize";

export interface CanvaEnv {
  DB: D1Database;
  CANVA_CLIENT_ID?: string;
  CANVA_CLIENT_SECRET?: string;
}

interface Stored {
  refreshToken: string;
  connectedBy: string | null;
  name?: string | null;
  at: string;
  access?: { token: string; expires: number };
}

export class CanvaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const canvaReady = (env: CanvaEnv) => !!env.CANVA_CLIENT_ID && !!env.CANVA_CLIENT_SECRET;

async function get<T>(env: CanvaEnv, key: string): Promise<T | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}
async function put(env: CanvaEnv, key: string, value: unknown | null) {
  if (value === null) {
    await env.DB.prepare("DELETE FROM settings WHERE key = ?1").bind(key).run();
    return;
  }
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value))
    .run();
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function randomString(n = 48) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

export async function pkceChallenge(verifier: string) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export const redirectUri = (origin: string) => `${origin}/api/canva/callback`;

/** Where to send the person to sign in to Canva. Remembers the PKCE verifier for the callback. */
export async function canvaAuthorizeUrl(env: CanvaEnv, origin: string): Promise<string> {
  if (!canvaReady(env)) throw new CanvaError("not-configured", 501);
  const verifier = randomString(64);
  const state = randomString(24);
  await put(env, PENDING_KEY, { verifier, state, at: Date.now() });
  const q = new URLSearchParams({
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "s256",
    scope: CANVA_SCOPES.join(" "),
    response_type: "code",
    client_id: env.CANVA_CLIENT_ID!,
    state,
    redirect_uri: redirectUri(origin),
  });
  return `${AUTHORIZE}?${q}`;
}

async function tokenCall(env: CanvaEnv, body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
    message?: string;
  };
  return { ok: res.ok, data };
}

/** Finishes the sign-in: swaps the code for tokens and keeps the refresh token. */
export async function canvaCallback(env: CanvaEnv, origin: string, code: string, state: string, user: string | null) {
  if (!canvaReady(env)) throw new CanvaError("not-configured", 501);
  const pending = await get<{ verifier: string; state: string; at: number }>(env, PENDING_KEY);
  if (!pending || pending.state !== state || Date.now() - pending.at > 15 * 60_000) {
    throw new CanvaError("The Canva sign-in took too long or came from somewhere else. Try connecting again.", 400);
  }
  await put(env, PENDING_KEY, null);
  const { ok, data } = await tokenCall(env, {
    grant_type: "authorization_code",
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(origin),
  });
  if (!ok || !data.access_token || !data.refresh_token) {
    throw new CanvaError(data.error_description ?? data.message ?? data.error ?? "Canva refused the sign-in.", 400);
  }
  const stored: Stored = {
    refreshToken: data.refresh_token,
    connectedBy: user,
    at: new Date().toISOString(),
    access: { token: data.access_token, expires: Date.now() + (data.expires_in ?? 14_400) * 1000 },
  };
  try {
    const me = await fetch(`${API}/users/me/profile`, { headers: { authorization: `Bearer ${data.access_token}` } });
    if (me.ok) stored.name = ((await me.json()) as { profile?: { display_name?: string } }).profile?.display_name ?? null;
  } catch {
    /* the name is only for the "Connected as" line */
  }
  await put(env, CANVA_KEY, stored);
}

/** A current access token, refreshed (and the new refresh token saved) when needed. Null when not connected. */
export async function canvaToken(env: CanvaEnv): Promise<string | null> {
  if (!canvaReady(env)) return null;
  const saved = await get<Stored>(env, CANVA_KEY);
  if (!saved) return null;
  if (saved.access && saved.access.expires - Date.now() > 5 * 60_000) return saved.access.token;
  const { ok, data } = await tokenCall(env, { grant_type: "refresh_token", refresh_token: saved.refreshToken });
  if (!ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      await put(env, CANVA_KEY, null);
      return null;
    }
    throw new CanvaError(data.error_description ?? data.message ?? data.error ?? "Canva didn't answer.", 502);
  }
  await put(env, CANVA_KEY, {
    ...saved,
    refreshToken: data.refresh_token ?? saved.refreshToken,
    access: { token: data.access_token, expires: Date.now() + (data.expires_in ?? 14_400) * 1000 },
  });
  return data.access_token;
}

export async function canvaStatus(env: CanvaEnv) {
  if (!canvaReady(env)) return { configured: false, connected: false };
  const saved = await get<Stored>(env, CANVA_KEY);
  return { configured: true, connected: !!saved, name: saved?.name ?? null };
}

export async function disconnectCanva(env: CanvaEnv) {
  const saved = await get<Stored>(env, CANVA_KEY);
  if (saved) {
    await fetch(`${API}/oauth/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${btoa(`${env.CANVA_CLIENT_ID}:${env.CANVA_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({ token: saved.refreshToken }),
    }).catch(() => undefined);
    await put(env, CANVA_KEY, null);
  }
}

async function call(env: CanvaEnv, path: string, init: RequestInit = {}) {
  const token = await canvaToken(env);
  if (!token) throw new CanvaError("not-connected", 401);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { message?: string; code?: string };
  if (!res.ok) throw new CanvaError(data.message ?? `Canva answered ${res.status}`, res.status === 401 ? 401 : 502);
  return data;
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

interface RawDesign {
  id: string;
  title?: string;
  thumbnail?: { url: string; width: number; height: number };
  urls?: { edit_url?: string };
  updated_at?: number;
  page_count?: number;
}

export function toDesign(d: RawDesign): CanvaDesign {
  return {
    id: d.id,
    title: d.title || "Untitled design",
    thumbnail: d.thumbnail?.url,
    width: d.thumbnail?.width,
    height: d.thumbnail?.height,
    pages: d.page_count,
    updated: d.updated_at,
    editUrl: d.urls?.edit_url,
  };
}

/** The account's designs, newest first, optionally searched. */
export async function listDesigns(env: CanvaEnv, query: string, continuation: string) {
  const q = new URLSearchParams({ sort_by: "modified_descending", ownership: "any" });
  if (query) q.set("query", query.slice(0, 255));
  if (continuation) q.set("continuation", continuation);
  const data = (await call(env, `/designs?${q}`)) as { items?: RawDesign[]; continuation?: string };
  return { designs: (data.items ?? []).map(toDesign), continuation: data.continuation ?? null };
}

export type ExportKind = "jpg" | "mp4";

/** Starts an export at Instagram's width (1080 px; height follows the design). */
export async function startExport(env: CanvaEnv, designId: string, kind: ExportKind) {
  const format = kind === "mp4" ? { type: "mp4", quality: "vertical_1080p" } : { type: "jpg", quality: 92, width: 1080 };
  const data = (await call(env, "/exports", { method: "POST", body: JSON.stringify({ design_id: designId, format }) })) as {
    job?: { id: string; status: string };
  };
  if (!data.job) throw new CanvaError("Canva didn't start the export.", 502);
  return { id: data.job.id, status: data.job.status };
}

export async function exportStatus(env: CanvaEnv, jobId: string) {
  const data = (await call(env, `/exports/${encodeURIComponent(jobId)}`)) as {
    job?: { id: string; status: "in_progress" | "success" | "failed"; urls?: string[]; error?: { message?: string } };
  };
  const job = data.job;
  if (!job) throw new CanvaError("Canva lost the export.", 502);
  return { status: job.status, urls: job.urls ?? [], error: job.error?.message };
}
