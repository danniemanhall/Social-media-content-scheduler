import { describe, expect, it } from "vitest";
import { planWeek, planRange, ideaBank, gridFormats, shuffleSlot, MIN_PILLARS_PER_WEEK } from "./planner";
import { addDays } from "./dates";
import { IDEAS } from "./ideas";
import type { Slot } from "./types";

function planWeeks(start: string, n: number) {
  const all: Slot[] = [];
  for (let w = 0; w < n; w++) all.push(...planWeek(addDays(start, 7 * w), all));
  return all;
}

describe("planWeek", () => {
  const monday = "2026-11-23";

  it("fills the default cadence: 1 reel, 2 grid posts, 3 stories", () => {
    const week = planWeek(monday, []);
    const count = (f: string[]) => week.filter((s) => f.includes(s.format)).length;
    expect(count(["reel"])).toBe(1);
    expect(count(["post", "carousel"])).toBe(2);
    expect(count(["story"])).toBe(3);
    expect(week.every((s) => s.date >= monday && s.date <= addDays(monday, 6))).toBe(true);
  });

  it("adds the optional Sunday story when asked", () => {
    expect(planWeek(monday, [], { includeOptional: true }).filter((s) => s.format === "story")).toHaveLength(4);
  });

  it("is deterministic for the same week and history", () => {
    expect(planWeek(monday, []).map((s) => s.ideaId)).toEqual(planWeek(monday, []).map((s) => s.ideaId));
  });

  it("covers at least 3 pillars every week, for a year", () => {
    const all = planWeeks(monday, 52);
    for (let w = 0; w < 52; w++) {
      const start = addDays(monday, 7 * w);
      const week = all.filter((s) => s.date >= start && s.date <= addDays(start, 6));
      expect(new Set(week.map((s) => s.pillar)).size).toBeGreaterThanOrEqual(MIN_PILLARS_PER_WEEK);
    }
  });

  it("never repeats an idea within the same week", () => {
    const week = planWeek(monday, []);
    expect(new Set(week.map((s) => s.ideaId)).size).toBe(week.length);
  });

  it("does not reuse a reel within 8 weeks while unused reels remain", () => {
    const all = planWeeks(monday, 8);
    const reels = all.filter((s) => s.format === "reel").map((s) => s.ideaId);
    expect(new Set(reels).size).toBe(reels.length);
  });

  it("never features the same product in two consecutive product posts", () => {
    const all = planWeeks(monday, 26).filter((s) => s.product);
    for (let i = 1; i < all.length; i++) expect(all[i].product).not.toBe(all[i - 1].product);
  });

  it("alternates grid layouts so a slot never repeats last week's layout", () => {
    const a = gridFormats(monday);
    const b = gridFormats(addDays(monday, 7));
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).not.toBe(b[1]);
  });

  it("only uses seasonal ideas in their months", () => {
    const all = planWeeks("2026-01-05", 52);
    const byId = Object.fromEntries(IDEAS.map((i) => [i.id, i]));
    for (const s of all) {
      const months = byId[s.ideaId].months;
      if (months?.length) expect(months).toContain(Number(s.date.slice(5, 7)));
    }
  });
});

describe("shuffleSlot", () => {
  it("keeps date, time, format and media but changes the idea", () => {
    const [slot] = planWeek("2026-11-23", []);
    const withMedia = { ...slot, media: [{ id: "m1", source: "drive" as const, name: "a.jpg", mimeType: "image/jpeg" }], status: "media" as const };
    const next = shuffleSlot(withMedia, [withMedia], "seed");
    expect(next.ideaId).not.toBe(slot.ideaId);
    expect(next.date).toBe(slot.date);
    expect(next.time).toBe(slot.time);
    expect(next.format).toBe(slot.format);
    expect(next.media).toHaveLength(1);
    expect(next.status).toBe("media");
  });
});

describe("Claude's extra ideas", () => {
  const extra = { ...IDEAS.find((i) => i.format === "reel")!, id: "claude-test-reel", title: "Claude reel", months: undefined };

  it("adds new ideas and ignores ones that reuse a built-in id", () => {
    const bank = ideaBank([extra, { ...IDEAS[0], title: "dupe" }]);
    expect(bank).toHaveLength(IDEAS.length + 1);
    expect(bank.find((i) => i.id === IDEAS[0].id)?.title).toBe(IDEAS[0].title);
  });

  it("can be shuffled into a slot", () => {
    const reel = planWeek("2026-11-23", []).find((s) => s.format === "reel")!;
    const onlyExtra = [extra, IDEAS.find((i) => i.id === reel.ideaId)!];
    expect(shuffleSlot(reel, [reel], "s", onlyExtra).ideaId).toBe("claude-test-reel");
  });
});

describe("planRange", () => {
  it("skips past, already planned and already filled weeks", () => {
    const filled = planWeek("2026-12-07", []);
    const { fresh, newWeeks } = planRange("2026-11-30", "2026-12-27", filled, ["2026-12-14"], IDEAS, "2026-12-07");
    expect(newWeeks).toEqual(["2026-12-07", "2026-12-21"]);
    expect(new Set(fresh.map((s) => s.date.slice(0, 10) >= "2026-12-21"))).toEqual(new Set([true]));
  });
});
