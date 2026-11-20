/**
 * Cloudflare Pages Function: the shared calendar API, backed by D1.
 * The whole site sits behind Cloudflare Access (Google sign-in), which adds
 * the signed-in user's email as a request header.
 */
import { connectGoogle, disconnectGoogle, googleReady, googleToken, GoogleError } from "../../server/google";
import {
  canvaAuthorizeUrl,
  canvaCallback,
  CanvaError,
  canvaStatus,
  disconnectCanva,
  exportStatus,
  listDesigns,
  startExport,
} from "../../server/canva";
import { briefLink } from "../../server/brief";

interface Env {
  DB: D1Database;
  /** Google OAuth client (public) and its secret, for keeping Drive connected. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Canva Connect integration (public id) and its secret, for the Canva browser in the post flow. */
  CANVA_CLIENT_ID?: string;
  CANVA_CLIENT_SECRET?: string;
  /** R2 bucket Meta fetches post files from. Optional until Phase 4 is set up. */
  OUTBOX?: R2Bucket;
  /** Public base URL of the outbox bucket, e.g. https://pub-xxxx.r2.dev */
  OUTBOX_PUBLIC_URL?: string;
}

const OUTBOX_KEY = /^outbox\/([\w-]{1,120}\.(?:jpg|mp4))$/;
const MAX_UPLOAD = 95 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SlotLike {
  id: string;
  date: string;
  updatedAt?: string;
}

function isSlot(x: unknown): x is SlotLike {
  const s = x as SlotLike;
  return !!s && typeof s.id === "string" && s.id.length <= 120 && typeof s.date === "string" && DATE.test(s.date);
}

/** Accepts only https links on Canva's own domains. */
export function canvaUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (host === "canva.com" || host.endsWith(".canva.com")) return u.toString();
    return null;
  } catch {
    return null;
  }
}

/** The Canva sign-in opens in a pop-up; this tells the app how it went and closes it. */
function closePage(error: string) {
  const payload = JSON.stringify({ type: "roopip-canva", ok: !error, error }).replace(/</g, "\\u003c");
  const text = error ? `Couldn't connect Canva: ${error.replace(/[<>&]/g, "")}` : "Canva is connected. You can close this window.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Canva</title><body style="font-family:sans-serif;padding:24px">${text}<script>try{opener&&opener.postMessage(${payload},location.origin)}catch(e){}setTimeout(function(){close()},${error ? 8000 : 600})</script>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const route = ((params.route as string[] | undefined) ?? []).join("/");
  const url = new URL(request.url);
  const user = request.headers.get("cf-access-authenticated-user-email") ?? "";

  try {
    if (route === "health") return json({ ok: true, db: !!env.DB });
    if (route === "me") return json({ email: user || null });

    if (route === "outbox" && request.method === "GET") {
      return json({ ready: !!env.OUTBOX && !!env.OUTBOX_PUBLIC_URL });
    }
    const box = route.match(OUTBOX_KEY);
    if (box && request.method === "PUT") {
      if (!env.OUTBOX || !env.OUTBOX_PUBLIC_URL) return json({ error: "Auto-posting isn't set up yet." }, 503);
      const size = Number(request.headers.get("content-length") ?? 0);
      if (size > MAX_UPLOAD) return json({ error: "File is too big to hand to Meta (95 MB at most)." }, 413);
      const type = box[1].endsWith(".mp4") ? "video/mp4" : "image/jpeg";
      await env.OUTBOX.put(box[1], request.body, { httpMetadata: { contentType: type } });
      return json({ key: box[1], url: `${env.OUTBOX_PUBLIC_URL.replace(/\/$/, "")}/${box[1]}` });
    }
    if (box && request.method === "DELETE") {
      if (env.OUTBOX) await env.OUTBOX.delete(box[1]);
      return json({ deleted: true });
    }

    // Canva export links don't allow the browser to fetch them directly, so
    // the app fetches them through here. Only Canva's own download hosts.
    if (route === "canva-file" && request.method === "GET") {
      const target = canvaUrl(url.searchParams.get("url"));
      if (!target) return json({ error: "That isn't a Canva download link." }, 400);
      const res = await fetch(target, { redirect: "follow" });
      if (!res.ok) return json({ error: res.status === 403 || res.status === 404 ? "expired" : `Canva said ${res.status}` }, res.status === 403 || res.status === 404 ? 410 : 502);
      return new Response(res.body, {
        headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }

    // Roopip's shared Google Drive connection (see server/google.ts).
    if (route === "google/token" && request.method === "GET") {
      if (!googleReady(env)) return json({ connected: false, configured: false });
      return json((await googleToken(env)) ?? { connected: false, configured: true });
    }
    if (route === "google/connect" && request.method === "POST") {
      const { code } = (await request.json()) as { code?: string };
      if (!code) return json({ error: "No code." }, 400);
      return json(await connectGoogle(env, code, user || null));
    }
    if (route === "google/disconnect" && request.method === "POST") {
      await disconnectGoogle(env);
      return json({ connected: false });
    }

    // Roopip's Canva account (see server/canva.ts).
    if (route === "canva/status" && request.method === "GET") return json(await canvaStatus(env));
    if (route === "canva/start" && request.method === "GET") {
      return Response.redirect(await canvaAuthorizeUrl(env, url.origin), 302);
    }
    if (route === "canva/callback" && request.method === "GET") {
      const err = url.searchParams.get("error");
      let message = "";
      if (err) message = url.searchParams.get("error_description") ?? err;
      else {
        try {
          await canvaCallback(env, url.origin, url.searchParams.get("code") ?? "", url.searchParams.get("state") ?? "", user || null);
        } catch (e) {
          message = e instanceof Error ? e.message : String(e);
        }
      }
      return closePage(message);
    }
    if (route === "canva/disconnect" && request.method === "POST") {
      await disconnectCanva(env);
      return json({ connected: false });
    }
    if (route === "canva/designs" && request.method === "GET") {
      return json(await listDesigns(env, url.searchParams.get("query") ?? "", url.searchParams.get("continuation") ?? ""));
    }
    if (route === "canva/export" && request.method === "POST") {
      const { designId, kind } = (await request.json()) as { designId?: string; kind?: string };
      if (!designId || !/^[\w-]{1,64}$/.test(designId)) return json({ error: "No design." }, 400);
      return json(await startExport(env, designId, kind === "mp4" ? "mp4" : "jpg"));
    }
    const job = route.match(/^canva\/export\/([\w-]{1,80})$/);
    if (job && request.method === "GET") return json(await exportStatus(env, job[1]));

    // The creator's month brief link (team only: /api sits behind the team's Access policy).
    if (route === "brief-link" && request.method === "GET") return json(await briefLink(env, user || null));
    if (route === "brief-link/reset" && request.method === "POST") return json(await briefLink(env, user || null, true));

    if (route === "slots" && request.method === "GET") {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      if (!DATE.test(from) || !DATE.test(to)) return json({ error: "from and to must be YYYY-MM-DD" }, 400);
      const { results } = await env.DB.prepare("SELECT data FROM slots WHERE date >= ?1 AND date <= ?2 ORDER BY date")
        .bind(from, to)
        .all<{ data: string }>();
      return json(results.map((r) => JSON.parse(r.data)));
    }

    if (route === "slots" && request.method === "PUT") {
      const body = (await request.json()) as unknown;
      const slots = Array.isArray(body) ? body : [body];
      if (slots.length > 200 || !slots.every(isSlot)) return json({ error: "invalid slots" }, 400);
      const now = new Date().toISOString();
      await env.DB.batch(
        slots.map((s) =>
          env.DB.prepare(
            "INSERT INTO slots (id, date, data, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5) " +
              "ON CONFLICT(id) DO UPDATE SET date = excluded.date, data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
          ).bind(s.id, s.date, JSON.stringify({ ...s, updatedAt: s.updatedAt ?? now }), now, user || null),
        ),
      );
      return json({ saved: slots.length });
    }

    const del = route.match(/^slots\/(.+)$/);
    if (del && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM slots WHERE id = ?1").bind(decodeURIComponent(del[1])).run();
      return json({ deleted: true });
    }

    const setting = route.match(/^settings\/([\w:.-]{1,100})$/);
    // Keys starting "secret:" (the Drive sign-in) never leave the server.
    if (setting && setting[1].startsWith("secret:")) return json({ error: "not found" }, 404);
    if (setting && request.method === "GET") {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(setting[1]).first<{ value: string }>();
      return json({ value: row ? JSON.parse(row.value) : null });
    }
    if (setting && request.method === "PUT") {
      const { value } = (await request.json()) as { value: unknown };
      await env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
        .bind(setting[1], JSON.stringify(value ?? null))
        .run();
      return json({ saved: true });
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    if (err instanceof GoogleError) return json({ error: err.message }, err.status);
    if (err instanceof CanvaError) return json({ error: err.message }, err.status);
    return json({ error: String(err) }, 500);
  }
};
