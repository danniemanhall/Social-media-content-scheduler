import { monthOf, weekStart } from "./dates";
import { eventIdeas, eventShare, momentsOn, PHASE_LABEL, type BrandEvent, type EventMoment } from "./events";
import { weekTheme, type WeekTheme } from "./playbook";
import type { Format, Idea, Pillar, Slot } from "./types";

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
  /**
   * The slot's pillar from the weekly rhythm. When set, evergreen ideas are
   * only ever from this pillar, and event ideas only come in when `campaign`
   * says this slot carries the campaign.
   */
  pillar?: Pillar;
  /** This slot carries a campaign (see campaignSlots): its ideas come first. */
  campaign?: EventMoment | null;
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
  const strict = !!input.pillar;
  for (const m of moments) {
    if (m.phase === "submit") continue;
    // On the rhythm, a slot is either a campaign slot (that campaign only) or a pillar slot (no events).
    if (strict && (!input.campaign || input.campaign.event.eventId !== m.event.eventId || input.campaign.phase !== m.phase)) continue;
    for (const f of input.formats) {
      for (const i of eventIdeas(m, f)) {
        if (exclude.has(i.id)) continue;
        eventPool.push({ ...i, reason: `${m.event.title} · ${PHASE_LABEL[m.phase]}`, eventId: m.event.eventId });
      }
    }
  }
  // A campaign slot leads with its campaign; otherwise events get their usual share.
  const nEvents = strict ? eventPool.length : Math.min(eventPool.length, eventShare(input.date, input.events, count));

  // Evergreen ideas, ranked by the doc's weekly theme and the season.
  const onPillar = (i: Idea) => !strict || i.pillar === input.pillar;
  const scored = input.bank
    .filter((i) => input.formats.includes(i.format) && !exclude.has(i.id) && onPillar(i))
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

  // Few ideas of this format on the pillar: ideas on the same pillar written for another format, to adapt.
  if (strict) {
    const FORMAT_NAME: Record<Format, string> = { story: "story", reel: "reel", post: "grid post", carousel: "carousel" };
    scored.push(
      ...input.bank
        .filter((i) => !input.formats.includes(i.format) && !exclude.has(i.id) && onPillar(i))
        .filter((i) => !i.months?.length || i.months.includes(month))
        .filter((i) => !(input.formats.includes("post") && i.format === "carousel"))
        .map((i) => ({ i, r: rand() + (i.id.startsWith("doc-") ? 0.4 : 0) }))
        .sort((a, b) => b.r - a.r)
        .map(({ i }) => ({ ...i, reason: `${i.pillar} · written as a ${FORMAT_NAME[i.format]}, easy to adapt` }) as Suggestion),
    );
  }

  const ideas = [...eventPool.slice(0, nEvents), ...scored.slice(0, Math.max(0, count - nEvents))];
  // Not enough evergreen left: top up with more event ideas, and the other way round.
  for (const extra of [...eventPool.slice(nEvents), ...scored.slice(Math.max(0, count - nEvents))]) {
    if (ideas.length >= count) break;
    if (!ideas.includes(extra)) ideas.push(extra);
  }
  return { ideas: ideas.slice(0, count), theme, moments, tasks };
}

/** Most slots a week gives to campaigns, so the pillar rhythm keeps going. */
export const MAX_CAMPAIGN_SLOTS = 2;

/**
 * Which of a week's slots carry a campaign, and which keep the pillar rhythm.
 * A slot is a candidate when an event is at a strong moment on its day
 * (starts today, last chance, on now, or announced this week). Stories go
 * first, as the doc suggests for sales; the grid post only takes a campaign
 * on the day it starts. At most MAX_CAMPAIGN_SLOTS a week.
 */
export function campaignSlots(slots: Pick<Slot, "id" | "date" | "format">[], events: BrandEvent[]): Map<string, EventMoment> {
  const out = new Map<string, EventMoment>();
  const byWeek = new Map<string, { id: string; m: EventMoment; score: number }[]>();
  for (const s of slots) {
    const m = momentsOn(s.date, events).find((x) => x.phase !== "submit" && x.weight >= 0.4);
    if (!m) continue;
    const grid = s.format === "post" || s.format === "carousel";
    if (grid && m.phase !== "launch") continue;
    const score = m.weight + (s.format === "story" ? 0.1 : s.format === "reel" ? 0.05 : 0);
    const w = weekStart(s.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), { id: s.id, m, score }]);
  }
  for (const list of byWeek.values()) {
    for (const c of list.sort((a, b) => b.score - a.score).slice(0, MAX_CAMPAIGN_SLOTS)) out.set(c.id, c.m);
  }
  return out;
}
