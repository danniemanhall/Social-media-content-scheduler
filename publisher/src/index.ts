/**
 * roopip-publisher: a Cloudflare Worker that runs every 15 minutes, posts
 * scheduled calendar slots that are due, and clears their files from the
 * R2 outbox afterwards.
 */
import { dueAt, processSlot, MAX_ATTEMPTS, type MetaConfig } from "./publish";
import type { Slot } from "../../src/lib/types";

interface Env {
  DB: D1Database;
  OUTBOX: R2Bucket;
  META_TOKEN?: string;
  IG_USER_ID?: string;
  FB_PAGE_ID?: string;
}

async function save(env: Env, before: { id: string; updated_at: string }, slot: Slot) {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "UPDATE slots SET data = ?1, updated_at = ?2, updated_by = 'publisher' WHERE id = ?3 AND updated_at = ?4",
  )
    .bind(JSON.stringify({ ...slot, updatedAt: now }), now, before.id, before.updated_at)
    .run();
  return res.meta.changes > 0;
}

async function run(env: Env) {
  if (!env.META_TOKEN || !env.IG_USER_ID) {
    console.log("Meta isn't connected yet (META_TOKEN and IG_USER_ID secrets). Nothing posted.");
    return;
  }
  const cfg: MetaConfig = { token: env.META_TOKEN, igUserId: env.IG_USER_ID, pageId: env.FB_PAGE_ID || undefined };
  const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT id, updated_at, data FROM slots WHERE json_extract(data, '$.status') = 'scheduled' AND date <= ?1 ORDER BY date",
  )
    .bind(today)
    .all<{ id: string; updated_at: string; data: string }>();

  for (const row of results) {
    const slot = JSON.parse(row.data) as Slot;
    if (!slot.publish || dueAt(slot) > Date.now()) continue;
    if (slot.music === "instagram") continue; // posted by hand
    const out = await processSlot(slot, cfg, (url, init) => fetch(url, init));
    let next: Slot = { ...slot, publish: out.publish };
    let clear = false;
    if (out.kind === "posted") {
      next = { ...next, status: "posted" };
      clear = true;
    } else if (out.kind === "failed" && (out.publish.attempts ?? 0) >= MAX_ATTEMPTS) {
      // Hand it back to people: back to Approved, with the reason on the post.
      next = { ...next, status: "approved" };
      clear = true;
    }
    const saved = await save(env, row, next);
    if (saved && clear) await env.OUTBOX.delete(out.publish.files.map((f) => f.key));
    console.log(`${slot.date} ${slot.title}: ${out.kind}${out.kind === "failed" ? ` (${out.message})` : ""}`);
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
} satisfies ExportedHandler<Env>;
