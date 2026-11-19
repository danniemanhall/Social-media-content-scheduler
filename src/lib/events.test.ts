import { describe, expect, it } from "vitest";
import { DEFAULT_EVENTS, eventShare, eventsOn, mergeDefaults, momentsOn, occurrences, parseDate, parseEvents, type BrandEvent } from "./events";
import { suggestIdeas } from "./suggest";
import { BUILT_IN_IDEAS } from "./planner";
import { weekTheme } from "./playbook";

const sale: BrandEvent = { id: "s", title: "Winter sale", kind: "sale", start: "2027-06-10", end: "2027-06-16", channels: ["shop"], source: "added" };

describe("events", () => {
  it("built-in events have unique ids and valid dates", () => {
    const ids = new Set(DEFAULT_EVENTS.map((e) => e.id));
    expect(ids.size).toBe(DEFAULT_EVENTS.length);
    for (const e of DEFAULT_EVENTS) {
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (e.end) expect(e.end >= e.start).toBe(true);
      if (e.submitBy) expect(e.submitBy < e.start).toBe(true);
    }
  });

  it("merging keeps hidden built-ins hidden and adds missing ones", () => {
    const merged = mergeDefaults([{ ...DEFAULT_EVENTS[0], hidden: true }, sale]);
    expect(merged.length).toBe(DEFAULT_EVENTS.length + 1);
    expect(merged.find((e) => e.id === DEFAULT_EVENTS[0].id)?.hidden).toBe(true);
    expect(occurrences(merged, "2026-01-01", "2028-01-01").some((e) => e.id === DEFAULT_EVENTS[0].id)).toBe(false);
  });

  it("walks through build-up, announce, launch, during, last chance and after", () => {
    const phase = (d: string) => momentsOn(d, [sale]).map((m) => m.phase);
    expect(phase("2027-05-20")).toEqual([]);
    expect(phase("2027-05-28")).toEqual(["build-up"]);
    expect(phase("2027-06-05")).toEqual(["announce"]);
    expect(phase("2027-06-10")).toEqual(["launch"]);
    expect(phase("2027-06-12")).toEqual(["during"]);
    expect(phase("2027-06-16")).toEqual(["last-chance"]);
    expect(phase("2027-06-18")).toEqual(["after"]);
  });

  it("reminds to submit marketplace deals in the week before the deadline", () => {
    const prime = DEFAULT_EVENTS.find((e) => e.id === "prime-day-2027")!;
    const m = momentsOn("2027-06-04", [prime]);
    expect(m[0].phase).toBe("submit");
    expect(m[0].task).toContain("Amazon.co.za");
    expect(momentsOn("2027-05-20", [prime]).some((x) => x.phase === "submit")).toBe(false);
  });

  it("repeats monthly events", () => {
    const monthly: BrandEvent = { id: "m", title: "Locals' sale", kind: "sale", start: "2027-01-31", repeat: "monthly", source: "added" };
    expect(eventsOn("2027-02-28", [monthly]).length).toBe(1);
    expect(eventsOn("2027-03-31", [monthly]).length).toBe(1);
  });

  it("never lets events take over all suggestions", () => {
    expect(eventShare("2027-06-12", [sale], 10)).toBeLessThanOrEqual(6);
    expect(eventShare("2027-05-01", [sale], 10)).toBe(0);
  });
});

describe("suggestIdeas", () => {
  it("mixes event ideas with evergreen ones and respects exclude", () => {
    const first = suggestIdeas({ date: "2027-06-12", formats: ["story"], bank: BUILT_IN_IDEAS, events: [sale] });
    expect(first.ideas).toHaveLength(10);
    const ev = first.ideas.filter((i) => i.eventId);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.length).toBeLessThan(10);
    expect(first.ideas.every((i) => i.format === "story")).toBe(true);
    const more = suggestIdeas({ date: "2027-06-12", formats: ["story"], bank: BUILT_IN_IDEAS, events: [sale], exclude: first.ideas.map((i) => i.id) });
    expect(more.ideas.some((i) => first.ideas.find((f) => f.id === i.id))).toBe(false);
  });

  it("leans on the doc's theme for the week when nothing is on", () => {
    const date = "2027-02-17";
    const out = suggestIdeas({ date, formats: ["post", "carousel"], bank: BUILT_IN_IDEAS, events: [] });
    const themed = out.ideas.filter((i) => weekTheme(date).pillars.includes(i.pillar)).length;
    expect(themed).toBeGreaterThanOrEqual(5);
  });
});

describe("parseEvents", () => {
  it("reads dates in common formats", () => {
    expect(parseDate("2027-03-14")).toBe("2027-03-14");
    expect(parseDate("14/03/2027")).toBe("2027-03-14");
    expect(parseDate("14 March 2027")).toBe("2027-03-14");
    expect(parseDate("March 14th, 2027")).toBe("2027-03-14");
  });

  it("reads pasted CSV, tab and range rows and skips headers", () => {
    const { events, skipped } = parseEvents(
      "Date,Event,Notes\n2027-03-01 to 2027-03-07, Autumn sale in the shop, 20% off placemats\n14 Feb 2027\tValentine's table for two\n2027-11-26\t2027-11-29\tTakealot Black Friday deals",
    );
    expect(skipped).toHaveLength(1);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ start: "2027-03-01", end: "2027-03-07", kind: "sale", notes: "20% off placemats" });
    expect(events[1]).toMatchObject({ start: "2027-02-14", kind: "holiday" });
    expect(events[2]).toMatchObject({ end: "2027-11-29", kind: "marketplace", channels: ["takealot"] });
  });
});
