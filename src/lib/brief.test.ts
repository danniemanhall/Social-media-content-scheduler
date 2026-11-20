import { describe, expect, it } from "vitest";
import { buildBrief, chosenShots, defaultBriefMonth, monthRange, newBriefToken, renderBriefHtml, shiftMonth } from "./brief";
import type { Slot } from "./types";

const slot = (o: Partial<Slot>): Slot => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  date: "2026-12-01",
  time: "12:00",
  format: "reel",
  ideaId: "x",
  pillar: "Craftsmanship",
  title: "A post",
  prompt: "",
  shots: [],
  caption: "",
  hashtags: [],
  cta: "",
  status: "idea",
  locked: false,
  media: [],
  music: "none",
  askClaude: false,
  notes: "",
  updatedAt: "",
  ...o,
});

describe("month helpers", () => {
  it("knows month ends and wraps years", () => {
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });
  it("plans next month from the 15th", () => {
    expect(defaultBriefMonth("2026-11-20")).toBe("2026-12");
    expect(defaultBriefMonth("2026-11-03")).toBe("2026-11");
  });
  it("makes url-safe tokens", () => {
    expect(newBriefToken()).toMatch(/^[\w-]{24}$/);
  });
});

describe("buildBrief", () => {
  const slots = [
    slot({ id: "a", date: "2026-12-02", shots: ["Hands coiling rope in the workshop", "Close-up of the stitching", "Skip me"], shotsChosen: [0, 1] }),
    slot({ id: "b", date: "2026-12-04", format: "post", pillar: "Lifestyle", product: "Placemats", shots: ["Dinner table set for four"] }),
    slot({ id: "c", date: "2026-12-05", status: "posted", shots: ["Hands sewing"] }),
    slot({ id: "open", date: "2026-12-06", ideaId: "", title: "" }),
    slot({ id: "nov", date: "2026-11-30", shots: ["Hands"] }),
  ];
  const b = buildBrief(slots, "2026-12");

  it("keeps planned posts in the month and counts open ones", () => {
    expect(b.posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(b.open).toBe(1);
    expect(b.counts).toEqual({ reels: 2, grid: 1, storyDays: 0 });
  });
  it("uses only the shots that were picked", () => {
    expect(chosenShots(slots[0])).toEqual(["Hands coiling rope in the workshop", "Close-up of the stitching"]);
  });
  it("groups the shoot list by session and leaves finished posts off", () => {
    const by = Object.fromEntries(b.sessions.map((s) => [s.scene, s.shots.map((x) => x.text)]));
    expect(by.process).toEqual(["Hands coiling rope in the workshop"]);
    expect(by.detail).toEqual(["Close-up of the stitching"]);
    expect(by.lifestyle).toEqual(["Dinner table set for four"]);
    expect(JSON.stringify(by)).not.toContain("Hands sewing");
    expect(b.sessions.find((s) => s.scene === "process")?.firstNeeded).toBe("2026-12-02");
  });
  it("groups posts by week", () => {
    expect(b.weeks.map((w) => w.monday)).toEqual(["2026-11-30"]);
  });
});

describe("renderBriefHtml", () => {
  it("escapes what people typed and shows notes and sizes", () => {
    const b = buildBrief([slot({ title: "<script>x</script>", briefNote: "Bring the green runner", format: "story" })], "2026-12");
    const html = renderBriefHtml(b, { base: "/brief/tok", photos: false, now: new Date("2026-11-20T08:00:00Z") });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Bring the green runner");
    expect(html).toContain("1080 × 1920");
    expect(html).toContain('src="/brief/logo.png"');
  });
  it("says when nothing is planned", () => {
    const html = renderBriefHtml(buildBrief([], "2027-01"), { base: "/brief/tok", photos: false, now: new Date() });
    expect(html).toContain("Nothing is planned for January 2027 yet");
  });
});
