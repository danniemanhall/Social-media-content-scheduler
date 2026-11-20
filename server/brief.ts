/**
 * The creator's month brief (see src/lib/brief.ts): a read-only page served at
 * /brief/<token>?m=YYYY-MM. The token is kept in D1 under a "secret:" key the
 * browser API never hands out; only the team's /api/brief-link can read or
 * replace it. Cloudflare Access can let the creator's email into /brief only,
 * so she can't open (or change) the calendar itself.
 */
import { BRIEF_KEY, buildBrief, defaultBriefMonth, monthRange, MONTH, newBriefToken, renderBriefHtml, type BriefLink } from "../src/lib/brief";
import type { Slot } from "../src/lib/types";
import { googleReady, googleToken, type GoogleEnv } from "./google";

export interface BriefEnv extends GoogleEnv {
  ASSETS?: { fetch(input: string): Promise<Response> };
}

const TOKEN = /^[\w-]{16,64}$/;

async function loadLink(env: { DB: D1Database }): Promise<BriefLink | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(BRIEF_KEY).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as BriefLink) : null;
}

/** The current share link token, made on first use. `reset` replaces it, so old links stop working. */
export async function briefLink(env: { DB: D1Database }, user: string | null, reset = false): Promise<BriefLink> {
  const saved = reset ? null : await loadLink(env);
  if (saved) return saved;
  const link: BriefLink = { token: newBriefToken(), createdAt: new Date().toISOString(), createdBy: user };
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(BRIEF_KEY, JSON.stringify(link))
    .run();
  return link;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());

const page = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
    },
  });

const gone = () =>
  page(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Roopip brief</title><body style="font:16px/1.5 sans-serif;background:#F3F0E9;color:#332a22;padding:40px 20px;max-width:520px;margin:auto"><h1 style="font-weight:600">This link no longer works</h1><p>The team has made a new link for the content brief. Ask them to send it again.</p>`,
    404,
  );

async function monthSlots(env: BriefEnv, month: string): Promise<Slot[]> {
  const { from, to } = monthRange(month);
  const { results } = await env.DB.prepare("SELECT data FROM slots WHERE date >= ?1 AND date <= ?2 ORDER BY date").bind(from, to).all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as Slot);
}

async function driveToken(env: BriefEnv): Promise<string | null> {
  if (!googleReady(env)) return null;
  return (await googleToken(env).catch(() => null))?.accessToken ?? null;
}

/** Handles everything under /brief/. `parts` is the path after /brief/. */
export async function handleBrief(request: Request, env: BriefEnv, parts: string[]): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Not allowed", { status: 405 });

  if (parts.length === 1 && parts[0] === "logo.png") {
    if (!env.ASSETS) return new Response(null, { status: 404 });
    return env.ASSETS.fetch(new URL("/roopip-logo.png", url.origin).toString());
  }

  const [token, kind, id] = parts;
  if (!token || !TOKEN.test(token)) return gone();
  const link = await loadLink(env);
  if (!link || link.token !== token) return gone();

  const m = url.searchParams.get("m") ?? "";
  const month = MONTH.test(m) ? m : defaultBriefMonth(today());

  if (!kind) {
    const access = await driveToken(env);
    const html = renderBriefHtml(buildBrief(await monthSlots(env, month), month), {
      base: `/brief/${token}`,
      photos: !!access,
      now: new Date(),
      embedded: url.searchParams.get("embed") === "1",
    });
    return page(html);
  }

  // A preview of one photo on this month's plan, through Roopip's Drive connection.
  if (kind === "img" && id && /^[\w-]{10,100}$/.test(id) && parts.length === 3) {
    const slots = await monthSlots(env, month);
    if (!slots.some((s) => (s.media ?? []).some((x) => x.source === "drive" && x.id === id))) return new Response(null, { status: 404 });
    const access = await driveToken(env);
    if (!access) return new Response(null, { status: 404 });
    const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${access}` },
    });
    const thumb = meta.ok ? ((await meta.json()) as { thumbnailLink?: string }).thumbnailLink : undefined;
    if (!thumb) return new Response(null, { status: 404 });
    const size = url.searchParams.get("size") === "1600" ? 1600 : 400;
    const src = thumb.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${size}`);
    let img = await fetch(src);
    if (!img.ok) img = await fetch(src, { headers: { authorization: `Bearer ${access}` } });
    if (!img.ok) return new Response(null, { status: 404 });
    return new Response(img.body, {
      headers: { "content-type": img.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  }
  return new Response(null, { status: 404 });
}
