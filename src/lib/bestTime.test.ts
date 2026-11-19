import { describe, expect, it } from "vitest";
import { suggestTime, MIN_OWN_POSTS } from "./bestTime";
import { openSlot } from "./planner";
import type { Slot } from "./types";

const posted = (date: string, time: string, reach: number, interactions: number): Slot => ({
  ...openSlot(date, time, "post", `${date}-${time}`),
  ideaId: "x",
  status: "posted",
  publish: { files: [], queuedAt: "", postedAt: `${date}T10:00:00Z`, stats: { reach, interactions, at: "" } },
});

describe("suggestTime", () => {
  it("uses the published research until there are enough of Roopip's own numbers", () => {
    const s = suggestTime(openSlot("2026-12-01", "10:00", "reel", "r"), []);
    expect(s.basis).toBe("research");
    expect(s.why).toContain("Sprout Social");
  });

  it("switches to Roopip's own best time window once there are enough posts", () => {
    const history: Slot[] = [];
    for (let i = 0; i < MIN_OWN_POSTS; i++) {
      const d = `2026-10-${String(i + 10).padStart(2, "0")}`;
      history.push(i % 2 ? posted(d, "18:00", 100, 12) : posted(d, "10:00", 100, 3));
    }
    const s = suggestTime(openSlot("2026-12-03", "12:30", "post", "g"), history);
    expect(s.basis).toBe("own");
    expect(s.time).toBe("18:00");
    expect(s.why).toMatch(/more/);
  });

  it("avoids a time another post already has that day", () => {
    const other = { ...openSlot("2026-12-01", "12:00", "story", "o"), ideaId: "y" };
    expect(suggestTime(openSlot("2026-12-01", "12:00", "reel", "r"), [other]).time).not.toBe("12:00");
  });
});
