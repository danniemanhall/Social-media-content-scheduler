/**
 * Posts one calendar slot to Instagram (and the Facebook Page) through the
 * Meta Graph API. No Cloudflare types here, so it can be unit-tested.
 *
 * Instagram works in two steps: create a media container from a public file
 * URL, then publish it. Videos take Meta a while to process, so a reel can
 * span several runs: the container id is saved and checked next time.
 */
import type { Publish, Slot } from "../../src/lib/types";

export interface MetaConfig {
  igUserId: string;
  /** Facebook Page id. Empty skips Facebook. */
  pageId?: string;
  /** Long-lived Page access token with instagram_content_publish and pages_manage_posts. */
  token: string;
  graph?: string;
}

export type Fetch = (url: string, init?: { method?: string; body?: URLSearchParams }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type Outcome =
  | { kind: "posted"; publish: Publish }
  | { kind: "waiting"; publish: Publish }
  | { kind: "failed"; publish: Publish; message: string };

export const GRAPH = "https://graph.facebook.com/v23.0";
export const MAX_ATTEMPTS = 3;

/** Johannesburg is UTC+2 all year (no daylight saving). */
export function dueAt(slot: Pick<Slot, "date" | "time">): number {
  return Date.parse(`${slot.date}T${slot.time || "12:00"}:00+02:00`);
}

/** Instagram takes at most 5 hashtags a post (since December 2025); more can get the post refused. */
export const MAX_HASHTAGS = 5;

export function captionOf(slot: Pick<Slot, "caption" | "cta" | "hashtags">) {
  return [slot.caption, slot.cta, slot.hashtags.slice(0, MAX_HASHTAGS).join(" ")].filter((s) => s && s.trim()).join("\n\n");
}

class GraphError extends Error {}

function client(cfg: MetaConfig, fetcher: Fetch) {
  const base = cfg.graph ?? GRAPH;
  const call = async (path: string, params: Record<string, string | undefined>, method: "GET" | "POST" = "POST") => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, v);
    body.set("access_token", cfg.token);
    const url = method === "GET" ? `${base}/${path}?${body}` : `${base}/${path}`;
    const res = await fetcher(url, method === "GET" ? { method } : { method, body });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || data.error) throw new GraphError(data.error?.message ?? `Meta answered ${res.status}`);
    return data;
  };
  return { call };
}

/** Advance one slot as far as it can go this run. Never throws. */
export async function processSlot(slot: Slot, cfg: MetaConfig, fetcher: Fetch): Promise<Outcome> {
  const pub: Publish = { ...slot.publish!, ig: { ...slot.publish?.ig }, fb: { ...slot.publish?.fb } };
  const { call } = client(cfg, fetcher);
  const files = pub.files;
  const caption = captionOf(slot);
  try {
    if (!files.length) throw new GraphError("No files were handed over for this post.");

    // ── Instagram ──
    const ig = cfg.igUserId;
    const one = (f: (typeof files)[number], extra: Record<string, string | undefined>) =>
      call(`${ig}/media`, f.type === "video" ? { video_url: f.url, ...extra } : { image_url: f.url, ...extra });

    // A story with several frames: each frame is its own story, posted in order.
    // Progress is kept per frame, so a retry carries on where it stopped.
    if (!pub.ig!.mediaId && slot.format === "story" && files.length > 1) {
      const frames = (pub.ig!.frames = files.map((_, i) => ({ ...pub.ig!.frames?.[i] })));
      for (const [i, f] of files.entries()) {
        const fr = frames[i];
        if (fr.mediaId) continue;
        if (!fr.containerId) fr.containerId = String((await one(f, { media_type: "STORIES" })).id);
        const st = await call(fr.containerId, { fields: "status_code,status" }, "GET");
        if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
          fr.containerId = undefined;
          throw new GraphError(`Instagram couldn't process story frame ${i + 1} (${String(st.status ?? st.status_code)}).`);
        }
        if (st.status_code && st.status_code !== "FINISHED" && st.status_code !== "PUBLISHED") return { kind: "waiting", publish: pub };
        fr.mediaId = String((await call(`${ig}/media_publish`, { creation_id: fr.containerId })).id);
      }
      pub.ig!.mediaId = frames.at(-1)!.mediaId;
    }

    if (!pub.ig!.mediaId) {
      if (!pub.ig!.containerId) {
        let created: Record<string, unknown>;
        if (slot.format === "carousel" && files.length > 1) {
          const children: string[] = [];
          for (const f of files.slice(0, 10)) {
            const c = await one(f, { is_carousel_item: "true", media_type: f.type === "video" ? "VIDEO" : undefined });
            children.push(String(c.id));
          }
          created = await call(`${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
        } else if (slot.format === "story") {
          created = await one(files[0], { media_type: "STORIES" });
        } else if (slot.format === "reel" || files[0].type === "video") {
          created = await one(files[0], { media_type: "REELS", caption, share_to_feed: "true" });
        } else {
          created = await one(files[0], { caption });
        }
        pub.ig!.containerId = String(created.id);
      }
      const status = await call(pub.ig!.containerId!, { fields: "status_code,status" }, "GET");
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        const why = String(status.status ?? status.status_code);
        pub.ig!.containerId = undefined;
        throw new GraphError(`Instagram couldn't process the file (${why}).`);
      }
      if (status.status_code && status.status_code !== "FINISHED" && status.status_code !== "PUBLISHED") {
        return { kind: "waiting", publish: pub };
      }
      const published = await call(`${ig}/media_publish`, { creation_id: pub.ig!.containerId });
      pub.ig!.mediaId = String(published.id);
      try {
        const info = await call(pub.ig!.mediaId, { fields: "permalink" }, "GET");
        if (typeof info.permalink === "string") pub.ig!.permalink = info.permalink;
      } catch {
        /* the post is up; the link is a nice-to-have */
      }
    }

    // ── Facebook Page ──
    if (!pub.fb!.postId && !pub.fb!.skipped) {
      if (!cfg.pageId) pub.fb!.skipped = "No Facebook Page set up.";
      else if (slot.format === "story") pub.fb!.skipped = "Stories post to Instagram only.";
      else if (files[0].type === "video") {
        const v = await call(`${cfg.pageId}/videos`, { file_url: files[0].url, description: caption });
        pub.fb!.postId = String(v.id);
      } else if (files.length > 1) {
        const ids: string[] = [];
        for (const f of files.filter((x) => x.type === "image").slice(0, 10)) {
          const p = await call(`${cfg.pageId}/photos`, { url: f.url, published: "false" });
          ids.push(String(p.id));
        }
        const params: Record<string, string> = { message: caption };
        ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
        const post = await call(`${cfg.pageId}/feed`, params);
        pub.fb!.postId = String(post.id);
      } else {
        const p = await call(`${cfg.pageId}/photos`, { url: files[0].url, message: caption });
        pub.fb!.postId = String(p.post_id ?? p.id);
      }
    }

    pub.postedAt = new Date().toISOString();
    pub.error = undefined;
    return { kind: "posted", publish: pub };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    pub.attempts = (pub.attempts ?? 0) + 1;
    pub.error = message;
    return { kind: "failed", publish: pub, message };
  }
}

export type Stats = NonNullable<Publish["stats"]>;

/**
 * Reads a post's reach and interactions from Instagram, for choosing the best
 * times to post. Needs the token to have instagram_manage_insights; without
 * it this returns null and the app keeps using published research.
 */
export async function readStats(mediaId: string, format: Slot["format"], cfg: MetaConfig, fetcher: Fetch, now = new Date()): Promise<Stats | null> {
  const metrics = format === "story" ? "reach,total_interactions" : "reach,total_interactions,saved,shares";
  const url = `${cfg.graph ?? GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(cfg.token)}`;
  const res = await fetcher(url, { method: "GET" });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
  const get = (n: string) => {
    const m = body.data?.find((d) => d.name === n);
    return m ? (m.total_value?.value ?? m.values?.[0]?.value) : undefined;
  };
  const reach = get("reach");
  if (reach === undefined) return null;
  return { reach, interactions: get("total_interactions"), saves: get("saved"), shares: get("shares"), at: now.toISOString() };
}

/** Whether to (re)read a posted slot's numbers now: daily for 2 weeks; stories only in their first day, while Instagram keeps them. */
export function wantsStats(slot: Slot, now = Date.now()): boolean {
  const pub = slot.publish;
  if (slot.status !== "posted" || !pub?.ig?.mediaId || !pub.postedAt) return false;
  const age = now - Date.parse(pub.postedAt);
  if (age > 14 * 86_400_000) return false;
  if (slot.format === "story" && age > 23 * 3600_000) return false;
  const last = pub.stats ? now - Date.parse(pub.stats.at) : Infinity;
  return slot.format === "story" ? last > 3 * 3600_000 : last > 20 * 3600_000;
}
