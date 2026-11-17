/**
 * Cloudflare Pages Function: the shared calendar API, backed by D1.
 * The whole site sits behind Cloudflare Access (Google sign-in), which adds
 * the signed-in user's email as a request header.
 */
interface Env {
  DB: D1Database;
}

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

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const route = ((params.route as string[] | undefined) ?? []).join("/");
  const url = new URL(request.url);
  const user = request.headers.get("cf-access-authenticated-user-email") ?? "";

  try {
    if (route === "health") return json({ ok: true, db: !!env.DB });
    if (route === "me") return json({ email: user || null });

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
    return json({ error: String(err) }, 500);
  }
};
