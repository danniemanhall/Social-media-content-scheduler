import { describe, expect, it } from "vitest";
import { gridOrder } from "../GridPreview";
import { dueByHand } from "../HandPostReminders";
import { stepsFor } from "./PostFlow";
import { framesOf } from "./InstagramPreview";
import { openSlot } from "../../lib/planner";
import type { Slot } from "../../lib/types";

const photo = (id: string) => ({ id, source: "drive" as const, name: `${id}.jpg`, mimeType: "image/jpeg" });
const s = (id: string, date: string, time: string, format: Slot["format"], status: Slot["status"]): Slot => ({
  ...openSlot(date, time, format, id),
  ideaId: "i",
  status,
  media: [photo(id)],
});

describe("grid preview", () => {
  it("shows grid posts and reels that are approved, scheduled or posted, newest top-left", () => {
    const slots = [
      s("old", "2026-11-01", "12:00", "post", "posted"),
      s("story", "2026-11-25", "10:00", "story", "scheduled"),
      s("later", "2026-11-27", "12:30", "carousel", "scheduled"),
      s("reel", "2026-11-25", "12:00", "reel", "approved"),
      s("draft", "2026-11-26", "12:00", "post", "media"),
    ];
    expect(gridOrder(slots).map((x) => x.id)).toEqual(["later", "reel", "old"]);
    expect(gridOrder(slots, "draft").map((x) => x.id)).toEqual(["later", "draft", "reel", "old"]);
  });
});

describe("hand-post reminders", () => {
  it("shows posts with an Instagram song from 2 hours before they're due", () => {
    const due = { ...s("a", "2026-12-01", "18:00", "story", "approved"), music: "instagram" as const };
    expect(dueByHand([due], Date.parse("2026-12-01T13:00:00Z"))).toHaveLength(0); // 15:00 SAST
    expect(dueByHand([due], Date.parse("2026-12-01T14:30:00Z"))).toHaveLength(1); // 16:30 SAST
    expect(dueByHand([{ ...due, status: "posted" }], Date.parse("2026-12-01T16:30:00Z"))).toHaveLength(0);
  });
});

describe("guided steps", () => {
  it("skips the idea, shots, media and B-roll steps for a Canva design", () => {
    const open = openSlot("2026-12-01", "10:00", "story", "x");
    expect(stepsFor(open)).toContain("shots");
    expect(stepsFor({ ...open, canvaDesign: { id: "D1", title: "Sale", pages: 4 } })).toEqual(["canva", "heading", "music", "words", "time", "preview"]);
  });

  it("previews every story frame, and a rendered reel as one video", () => {
    const story = { ...openSlot("2026-12-01", "10:00", "story", "x"), media: [photo("a"), photo("b"), photo("c"), photo("d")] };
    expect(framesOf(story)).toHaveLength(4);
    const reel = { ...openSlot("2026-12-01", "12:00", "reel", "r"), media: [photo("a")], render: { at: "", seconds: 18, name: "r.mp4", driveId: "R" } };
    expect(framesOf(reel).map((f) => f.id)).toEqual(["R"]);
  });
});
