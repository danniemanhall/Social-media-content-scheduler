import { describe, expect, it } from "vitest";
import { captionOf, dueAt, processSlot, readStats, wantsStats, type Fetch } from "./publish";
import { planWeek } from "../../src/lib/planner";
import type { Slot } from "../../src/lib/types";

const cfg = { igUserId: "ig1", pageId: "page1", token: "t", graph: "https://g" };

/** A fake Graph API that records calls and answers from a table. */
function fakeGraph(statuses: string[] = ["FINISHED"]) {
  const calls: { path: string; params: Record<string, string> }[] = [];
  let n = 0;
  const fetcher: Fetch = async (url, init) => {
    const u = new URL(url);
    const params = Object.fromEntries((init?.body ?? u.searchParams).entries());
    const path = u.pathname.slice(1);
    calls.push({ path, params });
    let body: Record<string, unknown> = { id: `id${++n}` };
    if (params.fields === "status_code,status") body = { status_code: statuses.shift() ?? "FINISHED" };
    if (params.fields === "permalink") body = { permalink: "https://instagram.com/p/x" };
    if (path === "page1/photos" && params.message) body = { id: "photo1", post_id: "page1_post1" };
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetcher };
}

function slot(format: Slot["format"], files: Slot["publish"] extends infer P ? P extends { files: infer F } ? F : never : never): Slot {
  const base = planWeek("2026-11-23", [])[0];
  return {
    ...base, format, caption: "Hello", cta: "Shop now.", hashtags: ["#roopip"],
    status: "scheduled", publish: { files, queuedAt: "2026-11-20T10:00:00Z" },
  };
}
const img = (k: string) => ({ key: k, url: `https://r2/${k}`, type: "image" as const });
const vid = (k: string) => ({ key: k, url: `https://r2/${k}`, type: "video" as const });

describe("publisher", () => {
  it("knows Johannesburg time and builds the caption", () => {
    expect(new Date(dueAt({ date: "2026-12-01", time: "18:30" })).toISOString()).toBe("2026-12-01T16:30:00.000Z");
    expect(captionOf({ caption: "A", cta: "B", hashtags: ["#c", "#d"] })).toBe("A\n\nB\n\n#c #d");
  });

  it("posts a single photo to Instagram and the Facebook Page", async () => {
    const g = fakeGraph();
    const out = await processSlot(slot("post", [img("a.jpg")]), cfg, g.fetcher);
    expect(out.kind).toBe("posted");
    expect(g.calls[0]).toMatchObject({ path: "ig1/media", params: { image_url: "https://r2/a.jpg", caption: "Hello\n\nShop now.\n\n#roopip" } });
    expect(g.calls.some((c) => c.path === "ig1/media_publish")).toBe(true);
    expect(out.publish.ig?.permalink).toBe("https://instagram.com/p/x");
    expect(out.publish.fb?.postId).toBe("page1_post1");
  });

  it("builds a carousel from children, and a multi-photo Facebook post", async () => {
    const g = fakeGraph();
    const out = await processSlot(slot("carousel", [img("a.jpg"), img("b.jpg"), img("c.jpg")]), cfg, g.fetcher);
    expect(out.kind).toBe("posted");
    const kids = g.calls.filter((c) => c.params.is_carousel_item === "true");
    expect(kids).toHaveLength(3);
    expect(g.calls.find((c) => c.params.media_type === "CAROUSEL")?.params.children.split(",")).toHaveLength(3);
    const feed = g.calls.find((c) => c.path === "page1/feed")!;
    expect(Object.keys(feed.params).filter((k) => k.startsWith("attached_media"))).toHaveLength(3);
  });

  it("waits for a reel to finish processing, then publishes on a later run", async () => {
    const g = fakeGraph(["IN_PROGRESS"]);
    const first = await processSlot(slot("reel", [vid("r.mp4")]), cfg, g.fetcher);
    expect(first.kind).toBe("waiting");
    expect(g.calls[0].params).toMatchObject({ media_type: "REELS", video_url: "https://r2/r.mp4" });
    const again = await processSlot({ ...slot("reel", [vid("r.mp4")]), publish: first.publish }, cfg, g.fetcher);
    expect(again.kind).toBe("posted");
    expect(g.calls.filter((c) => c.path === "ig1/media")).toHaveLength(1); // container reused
    expect(g.calls.some((c) => c.path === "page1/videos")).toBe(true);
  });

  it("posts stories to Instagram only", async () => {
    const g = fakeGraph();
    const out = await processSlot(slot("story", [img("s.jpg")]), cfg, g.fetcher);
    expect(g.calls[0].params.media_type).toBe("STORIES");
    expect(out.publish.fb?.skipped).toMatch(/Instagram only/);
  });

  it("doesn't post twice to Instagram when Facebook failed last time", async () => {
    const g = fakeGraph();
    const s = slot("post", [img("a.jpg")]);
    s.publish!.ig = { containerId: "c1", mediaId: "m1" };
    await processSlot(s, cfg, g.fetcher);
    expect(g.calls.every((c) => !c.path.startsWith("ig1/"))).toBe(true);
  });

  it("records Meta's error and counts the attempt", async () => {
    const fetcher: Fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Bad aspect ratio" } }) });
    const out = await processSlot(slot("post", [img("a.jpg")]), cfg, fetcher);
    expect(out).toMatchObject({ kind: "failed", message: "Bad aspect ratio" });
    expect(out.publish.attempts).toBe(1);
  });

  it("keeps captions to Instagram's 5 hashtags", () => {
    expect(captionOf({ caption: "A", cta: "", hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"] })).toBe("A\n\n#a #b #c #d #e");
  });

  it("posts every frame of a multi-photo story, in order, and resumes after a wait", async () => {
    const g = fakeGraph(["FINISHED", "IN_PROGRESS"]);
    const s = slot("story", [img("a"), vid("b"), img("c")]);
    const first = await processSlot(s, cfg, g.fetcher);
    expect(first.kind).toBe("waiting");
    expect(first.publish.ig?.frames?.[0].mediaId).toBeTruthy();
    expect(first.publish.ig?.frames?.[1].mediaId).toBeUndefined();
    const second = await processSlot({ ...s, publish: first.publish }, cfg, g.fetcher);
    expect(second.kind).toBe("posted");
    const creates = g.calls.filter((c) => c.path === "ig1/media");
    expect(creates.map((c) => c.params.image_url ?? c.params.video_url)).toEqual(["https://r2/a", "https://r2/b", "https://r2/c"]);
    expect(creates.every((c) => c.params.media_type === "STORIES")).toBe(true);
    expect(g.calls.filter((c) => c.path === "ig1/media_publish")).toHaveLength(3);
    expect(second.publish.fb?.skipped).toBeTruthy();
  });

  it("reads a post's reach and interactions, daily for two weeks", async () => {
    const fetcher: Fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ name: "reach", values: [{ value: 120 }] }, { name: "total_interactions", total_value: { value: 9 } }] }),
    });
    const stats = await readStats("m1", "post", cfg, fetcher, new Date("2026-12-01T10:00:00Z"));
    expect(stats).toEqual({ reach: 120, interactions: 9, saves: undefined, shares: undefined, at: "2026-12-01T10:00:00.000Z" });
    const posted = { ...slot("post", [img("a")]), status: "posted" as const };
    posted.publish = { ...posted.publish!, ig: { mediaId: "m1" }, postedAt: "2026-12-01T10:00:00Z" };
    const now = Date.parse("2026-12-02T12:00:00Z");
    expect(wantsStats(posted, now)).toBe(true);
    expect(wantsStats({ ...posted, publish: { ...posted.publish!, stats: { reach: 1, at: "2026-12-02T08:00:00Z" } } }, now)).toBe(false);
    expect(wantsStats(posted, Date.parse("2026-12-20T12:00:00Z"))).toBe(false);
    expect(wantsStats({ ...posted, format: "story" }, now)).toBe(false); // stories' numbers are gone after a day
  });
});
