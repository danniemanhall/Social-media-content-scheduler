import { describe, expect, it } from "vitest";
import { planWeek, planRange, ideaBank, shuffleSlot, slotFromIdea, replan, isOpen, BUILT_IN_IDEAS } from "./planner";
import { addDays } from "./dates";
import { IDEAS } from "./ideas";
import type { Slot } from "./types";

describe("planWeek", () => {
  const monday = "2026-11-23";

  it("plans 3 stories, 1 reel and 1 grid post, and keeps Sunday free", () => {
    const week = planWeek(monday, []);
    const count = (f: string[]) => week.filter((s) => f.includes(s.format)).length;
    expect(count(["reel"])).toBe(1);
    expect(count(["post", "carousel"])).toBe(1);
    expect(count(["story"])).toBe(3);
    expect(week.every((s) => s.date >= monday && s.date <= addDays(monday, 5))).toBe(true);
  });

  it("leaves every slot open, for the idea to be picked in the guided flow", () => {
    const week = planWeek(monday, []);
    expect(week.every((s) => isOpen(s) && s.title === "" && s.step === "canva")).toBe(true);
  });

  it("gives the same slot ids for the same week", () => {
    expect(planWeek(monday, []).map((s) => s.id)).toEqual(planWeek(monday, []).map((s) => s.id));
  });
});

describe("replan", () => {
  const today = "2026-11-24";
  const old = (date: string, format: Slot["format"], extra: Partial<Slot> = {}): Slot => ({
    ...slotFromIdea(IDEAS.find((i) => i.format === format)!, date, "08:00", `${date}-${format}-old`),
    ...extra,
  });

  it("swaps untouched pre-filled slots for open ones and keeps worked-on ones", () => {
    const existing = [
      old("2026-11-23", "story"), // past: left alone
      old("2026-11-25", "story"),
      old("2026-11-27", "post", { media: [{ id: "m", source: "drive", name: "a.jpg", mimeType: "image/jpeg" }], status: "media" }),
      old("2026-11-30", "reel"),
      old("2026-12-02", "carousel", { locked: true }),
    ];
    const { remove, add } = replan(existing, today);
    expect(remove.sort()).toEqual(["2026-11-25-story-old", "2026-11-30-reel-old"]);
    // This week: the grid post with media stays, so no new grid slot; past days get nothing.
    const thisWeek = add.filter((s) => s.date < "2026-11-30");
    expect(thisWeek.some((s) => s.format === "post")).toBe(false);
    expect(thisWeek.every((s) => s.date >= today)).toBe(true);
    // Next week: the locked carousel counts as the grid post.
    const next = add.filter((s) => s.date >= "2026-11-30");
    expect(next.filter((s) => s.format === "story")).toHaveLength(3);
    expect(next.filter((s) => s.format === "reel")).toHaveLength(1);
    expect(next.filter((s) => s.format === "post")).toHaveLength(0);
    expect(add.every(isOpen)).toBe(true);
  });

  it("leaves open slots and slots started in the flow alone", () => {
    const week = planWeek("2026-11-30", []);
    const started = { ...old("2026-12-01", "reel"), step: "media" as const };
    expect(replan([...week, started], today).remove).toEqual([]);
  });
});

describe("shuffleSlot", () => {
  it("keeps date, time, format and media but changes the idea", () => {
    const slot = slotFromIdea(IDEAS.find((i) => i.format === "story")!, "2026-11-23", "10:00", "s1");
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
    expect(bank).toHaveLength(BUILT_IN_IDEAS.length + 1);
    expect(bank.find((i) => i.id === IDEAS[0].id)?.title).toBe(IDEAS[0].title);
  });

  it("can be shuffled into a slot", () => {
    const reel = slotFromIdea(IDEAS.find((i) => i.format === "reel")!, "2026-11-24", "12:00", "r1");
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
