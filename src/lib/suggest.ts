import { monthOf } from "./dates";
import { eventIdeas, eventShare, momentsOn, PHASE_LABEL, type BrandEvent, type EventMoment } from "./events";
import { weekTheme, type WeekTheme } from "./playbook";
import type { Format, Idea } from "./types";

/**
 * The one place post ideas are suggested from: the idea bank (built-in, the
 * Drive doc's ideas and Claude's), the doc's weekly rhythm, and the events
 * calendar. The post flow calls suggestIdeas for "10 ideas" and again with
 * the shown ids in `exclude` for "10 other ideas".
 */

export interface Suggestion extends Idea {
  /** Why this idea, in a few words, e.g. "Black Friday · Announce". */
  reason: string;
  /** Set when the idea is about an event. */
  eventId?: string;
}

export interface SuggestInput {
  date: string;
  /** A grid slot can be "post" or "carousel"; pass both to mix them. */
  formats: Format[];
  bank: Idea[];
  events: BrandEvent[];
  count?: number;
  /** Idea ids already shown or recently used. */
  exclude?: Iterable<string>;
  /** Changes the order among equally good ideas. */
  seed?: string;
}

export interface SuggestOutput {
  ideas: Suggestion[];
  theme: WeekTheme;
  moments: EventMoment[];
  /** To-dos for the day, e.g. "Submit the Prime Day deal on Amazon.co.za by 2027-06-08." */
  tasks: string[];
}

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function suggestIdeas(input: SuggestInput): SuggestOutput {
  const count = input.count ?? 10;
  const exclude = new Set(input.exclude ?? []);
  const rand = rng(`${input.seed ?? ""}${input.date}${input.formats.join()}`);
  const theme = weekTheme(input.date);
  const moments = momentsOn(input.date, input.events);
  const tasks = moments.filter((m) => m.task).map((m) => m.task!);
  const month = monthOf(input.date);

  // Event ideas, most pressing event first, alternating formats.
  const eventPool: Suggestion[] = [];
  for (const m of moments) {
    if (m.phase === "submit") continue;
    for (const f of input.formats) {
      for (const i of eventIdeas(m, f)) {
        if (exclude.has(i.id)) continue;
        eventPool.push({ ...i, reason: `${m.event.title} · ${PHASE_LABEL[m.phase]}`, eventId: m.event.eventId });
      }
    }
  }
  const nEvents = Math.min(eventPool.length, eventShare(input.date, input.events, count));

  // Evergreen ideas, ranked by the doc's weekly theme and the season.
  const scored = input.bank
    .filter((i) => input.formats.includes(i.format) && !exclude.has(i.id))
    .filter((i) => !i.months?.length || i.months.includes(month))
    .map((i) => {
      let score = rand();
      const themed = theme.pillars.indexOf(i.pillar);
      if (themed >= 0) score += 1.5 - themed * 0.3;
      if (i.months?.length) score += 0.8;
      if (i.id.startsWith("doc-")) score += 0.4;
      const reason = themed >= 0 ? `${theme.name} week` : i.months?.length ? "In season" : "Evergreen";
      return { idea: { ...i, reason } as Suggestion, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.idea);

  const ideas = [...eventPool.slice(0, nEvents), ...scored.slice(0, count - nEvents)];
  // Not enough evergreen left: top up with more event ideas, and the other way round.
  for (const extra of [...eventPool.slice(nEvents), ...scored.slice(count - nEvents)]) {
    if (ideas.length >= count) break;
    if (!ideas.includes(extra)) ideas.push(extra);
  }
  return { ideas: ideas.slice(0, count), theme, moments, tasks };
}
