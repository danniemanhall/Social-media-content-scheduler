import { describe, expect, it } from "vitest";
import { applyIdea, captionOptions, ctaOptions, hashtagOptions, HASHTAG_LIMIT, moodsFor, rankIdeas, rankTracks } from "./postSuggest";
import { openSlot, slotFromIdea } from "./planner";
import { IDEAS } from "./ideas";

const story = openSlot("2026-12-02", "10:00", "story", "s1");

describe("rankIdeas", () => {
  it("only offers ideas of the slot's format, and both grid layouts for a grid slot", () => {
    expect(rankIdeas(story, IDEAS, []).every((r) => r.idea.format === "story")).toBe(true);
    const grid = rankIdeas(openSlot("2026-12-03", "12:30", "post", "g1"), IDEAS, []);
    expect(new Set(grid.map((r) => r.idea.format))).toEqual(new Set(["post", "carousel"]));
  });

  it("keeps seasonal ideas to their months", () => {
    const june = rankIdeas({ ...story, date: "2026-06-03" }, IDEAS, []);
    for (const r of june) if (r.idea.months?.length) expect(r.idea.months).toContain(6);
  });

  it("puts ideas used in the last 8 weeks last", () => {
    const top = rankIdeas(story, IDEAS, [])[0].idea;
    const used = slotFromIdea(top, "2026-11-20", "10:00", "used");
    const again = rankIdeas(story, IDEAS, [used]);
    expect(again[0].idea.id).not.toBe(top.id);
    expect(again.at(-1)!.idea.id).toBe(top.id);
  });

  it("puts ideas matching what was typed first", () => {
    const r = rankIdeas(story, IDEAS, [], "planters");
    expect(r[0].matched).toBe(true);
    expect(`${r[0].idea.title} ${r[0].idea.prompt} ${r[0].idea.product}`.toLowerCase()).toContain("planter");
  });
});

describe("words", () => {
  const idea = IDEAS.find((i) => i.format === "post")!;
  const slot = applyIdea(openSlot("2026-12-03", "12:30", "post", "g1"), idea);

  it("copies the idea in, keeping the slot's date and id", () => {
    expect(slot.title).toBe(idea.title);
    expect(slot.id).toBe("g1");
    expect(slot.date).toBe("2026-12-03");
  });

  it("offers several different captions and calls to action, the idea's own first", () => {
    const caps = captionOptions(slot);
    expect(caps[0]).toBe(idea.caption);
    expect(caps.length).toBeGreaterThanOrEqual(3);
    expect(new Set(caps).size).toBe(caps.length);
    expect(ctaOptions(slot)[0]).toBe(idea.cta);
  });

  it("suggests hashtags led by #roopip, with no repeats", () => {
    const tags = hashtagOptions(slot);
    expect(tags[0]).toBe("#roopip");
    expect(tags.length).toBeGreaterThanOrEqual(HASHTAG_LIMIT);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("music", () => {
  it("matches tracks to the post's moods by name", () => {
    const moods = moodsFor({ pillar: "Craftsmanship", format: "reel" });
    const r = rankTracks([{ name: "Upbeat pop.mp3" }, { name: "Calm acoustic guitar - morning.mp3" }], moods);
    expect(r[0].track.name).toContain("acoustic");
    expect(r[0].mood).toBeTruthy();
  });
});
