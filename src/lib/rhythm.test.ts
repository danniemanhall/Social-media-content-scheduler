import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { suggestForShots, type IndexedMedia } from "./brandFit";
import type { BrandEvent } from "./events";
import { BUILT_IN_IDEAS, planWeek, rhythmPillar } from "./planner";
import { weekTheme } from "./playbook";
import { campaignSlots, suggestIdeas } from "./suggest";

const MONDAYS = ["2027-02-01", "2027-02-08", "2027-02-15", "2027-02-22"];

describe("pillar rhythm", () => {
  it("gives every week its theme's three pillars, from the playbook", () => {
    for (const w of MONDAYS) {
      const slots = planWeek(w);
      const theme = weekTheme(w).pillars;
      expect(slots.every((s) => theme.includes(s.pillar))).toBe(true);
      expect(new Set(slots.map((s) => s.pillar)).size).toBe(3);
      // Stories alone also cover all three.
      expect(new Set(slots.filter((s) => s.format === "story").map((s) => s.pillar)).size).toBe(3);
    }
  });

  it("swaps the lead pillar between the reel and the grid post week to week", () => {
    const reel = (w: string) => rhythmPillar(addDays(w, 1), "reel");
    const grid = (w: string) => rhythmPillar(addDays(w, 3), "post");
    const leads = MONDAYS.map((w) => (reel(w) === weekTheme(w).pillars[0] ? "reel" : grid(w) === weekTheme(w).pillars[0] ? "grid" : "none"));
    expect(leads).not.toContain("none");
    expect(new Set(leads).size).toBe(2);
  });
});

describe("ideas on the slot's pillar", () => {
  it("only suggests ideas from the slot's pillar, topping up from other formats", () => {
    for (const w of MONDAYS) {
      for (const s of planWeek(w)) {
        const formats = s.format === "post" ? (["post", "carousel"] as const) : ([s.format] as const);
        const out = suggestIdeas({ date: s.date, formats: [...formats], bank: BUILT_IN_IDEAS, events: [], pillar: s.pillar });
        expect(out.ideas.length).toBeGreaterThanOrEqual(5);
        expect(out.ideas.every((i) => i.pillar === s.pillar)).toBe(true);
      }
    }
  });

  const sale: BrandEvent = { id: "s", title: "Winter sale", kind: "sale", start: "2027-06-10", end: "2027-06-16", channels: ["shop"], source: "added" };

  it("leaves events out of pillar slots and leads with them on campaign slots", () => {
    const week = planWeek("2027-06-07");
    const plan = campaignSlots(week, [sale]);
    expect(plan.size).toBeGreaterThan(0);
    expect(plan.size).toBeLessThanOrEqual(2);
    for (const s of week) {
      const out = suggestIdeas({ date: s.date, formats: [s.format], bank: BUILT_IN_IDEAS, events: [sale], pillar: s.pillar, campaign: plan.get(s.id) ?? null });
      if (plan.has(s.id)) expect(out.ideas[0].eventId).toBe("s");
      else expect(out.ideas.some((i) => i.eventId)).toBe(false);
    }
  });

  it("keeps the grid post on the pillar unless the campaign starts that day", () => {
    const week = planWeek("2027-06-07"); // the grid post is Thursday 10 June, the sale's first day
    const grid = week.find((s) => s.format === "post")!;
    expect(campaignSlots(week, [sale]).get(grid.id)?.phase).toBe("launch");
    const later = planWeek("2027-06-14");
    const laterGrid = later.find((s) => s.format === "post")!;
    expect(campaignSlots(later, [sale]).has(laterGrid.id)).toBe(false);
  });
});

describe("media per shot", () => {
  const lib: IndexedMedia[] = [
    { id: "stitch", source: "drive", name: "stitch-close-up-placemat.jpg", mimeType: "image/jpeg", path: "Process", width: 1080, height: 1350 },
    { id: "workshop", source: "drive", name: "workshop-wide.jpg", mimeType: "image/jpeg", path: "Workshop", width: 1080, height: 1350 },
    { id: "table", source: "drive", name: "placemat-dining-table-styled.jpg", mimeType: "image/jpeg", path: "Lifestyle", width: 1080, height: 1350 },
  ];
  it("gives each ticked shot its own photos, each photo once", () => {
    const slot = { id: "x", format: "carousel" as const, pillar: "Craftsmanship" as const, product: "Placemats" as const, title: "The stitch", media: [] };
    const groups = suggestForShots(slot, ["Close-up of the stitch", "Wide shot of the workshop", "Placemat on the dining table"], lib, {}, {}, "2027-02-01");
    expect(groups.map((g) => g.items[0]?.media.id)).toEqual(["stitch", "workshop", "table"]);
    const all = groups.flatMap((g) => g.items.map((i) => i.media.id));
    expect(new Set(all).size).toBe(all.length);
  });
});
