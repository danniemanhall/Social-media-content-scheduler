/**
 * Keeps Roopip's Google Drive connected for everyone, without asking again on
 * every visit. Someone connects once (as carli@roopip.co.za); Google gives the
 * server a long-lived refresh token, which is kept in D1 under a key the
 * browser can't read. The app then asks this server for short-lived access
 * tokens. Signing out (Disconnect) revokes it with Google and deletes it.
 *
 * Needs GOOGLE_CLIENT_ID (wrangler.toml) and the GOOGLE_CLIENT_SECRET secret
 * (Cloudflare dashboard). Without the secret the app falls back to signing in
 * in the browser each visit.
 */

export const GOOGLE_KEY = "secret:google";
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"];

export interface GoogleEnv {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

interface Stored {
  refreshToken: string;
  email: string | null;
  connectedBy: string | null;
  at: string;
  access?: { token: string; expires: number };
}

export interface TokenReply {
  connected: true;
  accessToken: string;
  expiresIn: number;
  email: string | null;
}

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function googleReady(env: GoogleEnv) {
  return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

async function load(env: GoogleEnv): Promise<Stored | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(GOOGLE_KEY).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as Stored) : null;
}

async function store(env: GoogleEnv, value: Stored | null) {
  if (!value) {
    await env.DB.prepare("DELETE FROM settings WHERE key = ?1").bind(GOOGLE_KEY).run();
    return;
  }
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(GOOGLE_KEY, JSON.stringify(value))
    .run();
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const part = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

async function tokenCall(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  return { ok: res.ok, data };
}

/** Exchanges the one-time code from the Google pop-up and keeps the refresh token. */
export async function connectGoogle(env: GoogleEnv, code: string, user: string | null): Promise<TokenReply> {
  if (!googleReady(env)) throw new GoogleError("not-configured", 501);
  const { ok, data } = await tokenCall({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: "postmessage",
    grant_type: "authorization_code",
  });
  if (!ok || !data.access_token) throw new GoogleError(data.error_description ?? data.error ?? "Google refused the sign-in.", 400);
  const granted = (data.scope ?? "").split(" ");
  if (!DRIVE_SCOPES.every((s) => granted.includes(s))) throw new GoogleError("missing_scopes", 400);

  const previous = await load(env);
  const refreshToken = data.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new GoogleError("Google didn't send a long-lived sign-in. Disconnect and connect again.", 400);
  const expiresIn = data.expires_in ?? 3600;
  const email = emailFromIdToken(data.id_token);
  await store(env, {
    refreshToken,
    email,
    connectedBy: user,
    at: new Date().toISOString(),
    access: { token: data.access_token, expires: Date.now() + expiresIn * 1000 },
  });
  return { connected: true, accessToken: data.access_token, expiresIn, email };
}

/** A current access token, refreshed when needed. Null when nobody has connected. */
export async function googleToken(env: GoogleEnv): Promise<TokenReply | null> {
  if (!googleReady(env)) throw new GoogleError("not-configured", 501);
  const saved = await load(env);
  if (!saved) return null;
  const now = Date.now();
  if (saved.access && saved.access.expires - now > 5 * 60_000) {
    return { connected: true, accessToken: saved.access.token, expiresIn: Math.floor((saved.access.expires - now) / 1000), email: saved.email };
  }
  const { ok, data } = await tokenCall({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    refresh_token: saved.refreshToken,
    grant_type: "refresh_token",
  });
  if (!ok || !data.access_token) {
    // invalid_grant: revoked, password changed, or (in Google's Testing mode) 7 days old.
    if (data.error === "invalid_grant") {
      await store(env, null);
      return null;
    }
    throw new GoogleError(data.error_description ?? data.error ?? "Google didn't answer.", 502);
  }
  const expiresIn = data.expires_in ?? 3600;
  await store(env, { ...saved, access: { token: data.access_token, expires: now + expiresIn * 1000 } });
  return { connected: true, accessToken: data.access_token, expiresIn, email: saved.email };
}

/** Signs Roopip's Drive out: revokes the token with Google and forgets it. */
export async function disconnectGoogle(env: GoogleEnv) {
  const saved = await load(env);
  if (saved) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(saved.refreshToken)}`, { method: "POST" }).catch(() => {});
    await store(env, null);
  }
}
