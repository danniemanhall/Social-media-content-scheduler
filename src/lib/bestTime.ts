import { dayOfWeek } from "./dates";
import type { Format, Slot } from "./types";

/**
 * When to post. Roopip's own Instagram numbers win once there are enough of
 * them: the publisher reads reach and interactions for every post it puts up
 * (publish.stats). Until then the app uses Sprout Social's 2025 study of
 * billions of engagements (best: Monday to Thursday, 10 AM to 3 PM local).
 */

export interface TimeSuggestion {
  time: string;
  why: string;
  /** "own": from Roopip's posts. "research": from the published study. */
  basis: "own" | "research";
  /** Other good times, for a one-click change. */
  alternatives: string[];
}

/** Fewest posts with numbers before the app trusts Roopip's own data for a time window. */
export const MIN_OWN_POSTS = 8;
const WINDOWS = [
  { from: 7, to: 9, time: "08:00" },
  { from: 10, to: 11, time: "10:00" },
  { from: 12, to: 13, time: "12:30" },
  { from: 14, to: 16, time: "15:00" },
  { from: 17, to: 19, time: "18:00" },
  { from: 20, to: 22, time: "20:00" },
];

const RESEARCH: Record<"story" | "reel" | "grid", { time: string; alternatives: string[] }> = {
  story: { time: "10:00", alternatives: ["08:00", "12:30", "18:00"] },
  reel: { time: "12:00", alternatives: ["10:00", "15:00", "18:00"] },
  grid: { time: "12:30", alternatives: ["10:00", "15:00", "18:00"] },
};

const hourOf = (t: string) => Number(t.slice(0, 2));
const kind = (f: Format) => (f === "post" || f === "carousel" ? "grid" : f);

/** Engagement rate (interactions per person reached) for each time window, from posted slots with stats. */
export function ownEngagement(history: Slot[]) {
  const by: Record<string, { n: number; rate: number }> = {};
  for (const s of history) {
    const st = s.publish?.stats;
    if (s.status !== "posted" || !st?.reach || st.interactions === undefined) continue;
    const w = WINDOWS.find((x) => hourOf(s.time) >= x.from && hourOf(s.time) <= x.to);
    if (!w) continue;
    const r = (by[w.time] ??= { n: 0, rate: 0 });
    r.rate = (r.rate * r.n + st.interactions / st.reach) / (r.n + 1);
    r.n++;
  }
  return by;
}

export function suggestTime(slot: Pick<Slot, "id" | "date" | "format">, history: Slot[]): TimeSuggestion {
  const k = kind(slot.format);
  const posted = history.filter((s) => s.status === "posted" && s.publish?.stats?.reach);
  const taken = new Set(history.filter((s) => s.date === slot.date && s.id !== slot.id).map((s) => s.time));
  const dow = dayOfWeek(slot.date);

  if (posted.length >= MIN_OWN_POSTS) {
    const by = ownEngagement(history);
    const ranked = Object.entries(by)
      .filter(([, v]) => v.n >= 2)
      .sort((a, b) => b[1].rate - a[1].rate);
    if (ranked.length >= 2) {
      const [best, stats] = ranked.find(([t]) => !taken.has(t)) ?? ranked[0];
      const avg = posted.reduce((n, s) => n + (s.publish!.stats!.interactions ?? 0) / s.publish!.stats!.reach!, 0) / posted.length;
      const lift = avg > 0 ? Math.round((stats.rate / avg - 1) * 100) : 0;
      return {
        time: best,
        basis: "own",
        why: `Roopip's ${stats.n} posts around ${best} got ${lift > 0 ? `${lift}% more` : "the most"} likes, comments, saves and shares per person reached than the average post (from ${posted.length} posts' Instagram numbers).`,
        alternatives: ranked.slice(0, 4).map(([t]) => t).filter((t) => t !== best),
      };
    }
  }

  const r = RESEARCH[k];
  const time = taken.has(r.time) ? (r.alternatives.find((t) => !taken.has(t)) ?? r.time) : r.time;
  const weekday = dow <= 4;
  return {
    time,
    basis: "research",
    why:
      `Sprout Social's 2025 study of Instagram engagement found weekdays from 10 AM to 3 PM local time work best${weekday ? ", with Monday to Thursday strongest" : "; weekends are quieter, so earlier in the day is safer"}. ` +
      `Once ${MIN_OWN_POSTS} posts have gone out through the app, this switches to Roopip's own Instagram numbers.`,
    alternatives: r.alternatives.filter((t) => t !== time),
  };
}
