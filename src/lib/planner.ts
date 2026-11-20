import { IDEAS } from "./ideas";
import { DOC_IDEAS, weekTheme } from "./playbook";
import { PILLARS } from "./brand";
import { addDays, monthOf, toUTC, weekStart } from "./dates";
import type { Format, Idea, Pillar, Slot, TemplateSlot } from "./types";

/**
 * Default week (Daniel, 19 Nov 2026): 3 stories, 1 reel and 1 grid post, with
 * Sundays kept free. The calendar shows these as open slots ("Story needed");
 * the idea is chosen when someone opens the slot. Starting times follow
 * Sprout Social's 2025 study (weekdays, 10 AM to 3 PM local) until Roopip's
 * own Instagram numbers say otherwise (see bestTime.ts).
 */
export const DEFAULT_TEMPLATE: TemplateSlot[] = [
  { dow: 1, kind: "story", time: "10:00" },
  { dow: 2, kind: "reel", time: "12:00" },
  { dow: 3, kind: "story", time: "10:00" },
  { dow: 4, kind: "grid", time: "12:30" },
  { dow: 6, kind: "story", time: "09:30" },
];

/** Version of the weekly plan. Bumped when the template or the rhythm changes so planned weeks are redone once. */
export const PLAN_VERSION = 3;
export const PLAN_VERSION_KEY = "planVersion";

export const COOLDOWN_WEEKS = 8;
export const MIN_PILLARS_PER_WEEK = 3;

export interface PlanOptions {
  template?: TemplateSlot[];
  includeOptional?: boolean;
  ideas?: Idea[];
}

/** Small deterministic PRNG so a week always plans the same way. */
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

function fits(idea: Idea, month: number) {
  return !idea.months || idea.months.length === 0 || idea.months.includes(month);
}

/**
 * Which grid layout goes on which day alternates week to week, so a grid
 * slot never repeats the previous week's layout.
 */
export function gridFormats(weekStartISO: string): [Format, Format] {
  const weekIndex = Math.floor(toUTC(weekStartISO) / (7 * 86_400_000));
  return weekIndex % 2 === 0 ? ["carousel", "post"] : ["post", "carousel"];
}

export function slotFromIdea(idea: Idea, date: string, time: string, id: string): Slot {
  return {
    id,
    date,
    time,
    format: idea.format,
    ideaId: idea.id,
    pillar: idea.pillar,
    product: idea.product,
    title: idea.title,
    prompt: idea.prompt,
    shots: [...idea.shots],
    caption: idea.caption,
    hashtags: [...idea.hashtags],
    cta: idea.cta,
    status: "idea",
    locked: false,
    media: [],
    music: idea.format === "reel" ? "royalty-free" : "none",
    askClaude: false,
    notes: "",
    updatedAt: new Date(0).toISOString(),
  };
}

interface PickContext {
  month: number;
  recentIdeaIds: Set<string>;
  usedThisWeek: Set<string>;
  pillarsThisWeek: Set<string>;
  lastProduct?: string;
  rand: () => number;
  slotsLeft: number;
}

export function pickIdea(candidates: Idea[], ctx: PickContext): Idea {
  const pool = candidates.filter((i) => !ctx.usedThisWeek.has(i.id));
  const missingPillars = MIN_PILLARS_PER_WEEK - ctx.pillarsThisWeek.size;
  let best: Idea | undefined;
  let bestScore = -Infinity;
  for (const i of pool) {
    let score = ctx.rand();
    if (!fits(i, ctx.month)) continue;
    if (i.months?.length) score += 0.6; // seasonal ideas win in their season
    if (ctx.recentIdeaIds.has(i.id)) score -= 10;
    if (!ctx.pillarsThisWeek.has(i.pillar)) score += missingPillars >= ctx.slotsLeft ? 20 : 1;
    if (i.product && i.product === ctx.lastProduct) score -= 5;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // Fall back to anything of the right format if filters emptied the pool.
  return best ?? pool[0] ?? candidates[0];
}

/**
 * The pillar a slot carries, from the Drive playbook's four-week rhythm
 * (playbook.ts, weekTheme). Each week's theme has three pillars, its lead
 * pillar first. The reel and the grid post take the first two (swapping each
 * week, so both get the lead pillar over a month) and the three stories take
 * one each, so a week shows its lead pillars twice and the third once, and
 * the grid and stories both move through every theme.
 */
export function rhythmPillar(date: string, format: Format, template: TemplateSlot[] = DEFAULT_TEMPLATE): Pillar {
  const [a, b, c] = weekTheme(date).pillars;
  const swap = Math.floor(toUTC(weekStart(date)) / (7 * 86_400_000)) % 2 === 1;
  const [first, second] = swap ? [b, a] : [a, b];
  if (format === "reel") return first;
  if (format === "post" || format === "carousel") return second;
  const dow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const storyDays = template.filter((t) => t.kind === "story").map((t) => t.dow).sort();
  const i = storyDays.includes(dow) ? storyDays.indexOf(dow) : storyDays.filter((d) => d < dow).length;
  return [c, second, first][i % 3];
}

/** A slot with no idea yet: the calendar shows it as "Story needed" until someone picks one. */
export function openSlot(date: string, time: string, format: Format, id: string): Slot {
  return {
    id,
    date,
    time,
    format,
    ideaId: "",
    pillar: rhythmPillar(date, format),
    title: "",
    prompt: "",
    shots: [],
    caption: "",
    hashtags: [],
    cta: "",
    status: "idea",
    locked: false,
    media: [],
    music: format === "reel" ? "royalty-free" : "none",
    askClaude: false,
    notes: "",
    updatedAt: new Date(0).toISOString(),
    step: "canva",
  };
}

/** True while nobody has picked an idea for the slot. */
export const isOpen = (s: Pick<Slot, "ideaId">) => !s.ideaId;

/**
 * Plan one week: one open slot per template entry. Ideas are no longer
 * chosen up front; the guided flow suggests them when the slot is opened.
 * @param weekStartISO the Monday of the week
 */
export function planWeek(weekStartISO: string, _history: Slot[] = [], opts: PlanOptions = {}): Slot[] {
  const template = (opts.template ?? DEFAULT_TEMPLATE).filter((t) => opts.includeOptional || !t.optional);
  const ordered = [...template].sort((a, b) => a.dow - b.dow || a.time.localeCompare(b.time));
  return ordered.map((t) => {
    const date = addDays(weekStartISO, t.dow - 1);
    const format: Format = t.kind === "grid" ? "post" : t.kind;
    return openSlot(date, t.time, format, `${date}-${t.kind}-${t.time.replace(":", "")}`);
  });
}

/** Planned in advance but never touched: no media, not locked, not asked about, not started in the flow. */
export function untouched(s: Slot) {
  return (
    s.status === "idea" && !s.media.length && !s.locked && !s.askClaude && !s.canva && !s.step && !s.publish && !!s.ideaId
  );
}

/**
 * Moves weeks planned with the old template (pre-filled topics, 2 grid posts)
 * to the new one: untouched future slots are removed, and each week gets open
 * slots for whatever the template still needs. Slots someone has worked on stay.
 */
export function replan(existing: Slot[], today: string, template: TemplateSlot[] = DEFAULT_TEMPLATE): { remove: string[]; add: Slot[] } {
  const future = existing.filter((s) => s.date >= today);
  const remove = future.filter(untouched).map((s) => s.id);
  const gone = new Set(remove);
  const kept = future.filter((s) => !gone.has(s.id));
  const weeks = new Set(future.map((s) => weekStart(s.date)));
  const add: Slot[] = [];
  for (const w of [...weeks].sort()) {
    const inWeek = kept.filter((s) => weekStart(s.date) === w);
    const have: Record<string, number> = {};
    for (const s of inWeek) {
      const k = s.format === "post" || s.format === "carousel" ? "grid" : s.format;
      have[k] = (have[k] ?? 0) + 1;
    }
    for (const fresh of planWeek(w, [], { template })) {
      const k = fresh.format === "post" ? "grid" : fresh.format;
      if (have[k]) {
        have[k]--;
        continue;
      }
      if (fresh.date < today) continue;
      if (existing.some((s) => s.id === fresh.id && !gone.has(s.id))) continue;
      add.push(fresh);
    }
  }
  return { remove, add };
}

/** Swap a slot's idea for another of the same format, keeping date, time and media. */
export function shuffleSlot(slot: Slot, history: Slot[], seed = String(Date.now()), bank: Idea[] = IDEAS): Slot {
  const rand = rng(seed + slot.id);
  const weekIds = new Set(history.filter((s) => s.date.slice(0, 7) === slot.date.slice(0, 7)).map((s) => s.ideaId));
  weekIds.add(slot.ideaId);
  const candidates = bank.filter((i) => i.format === slot.format && !weekIds.has(i.id) && fits(i, monthOf(slot.date)));
  const pool = candidates.length ? candidates : bank.filter((i) => i.format === slot.format && i.id !== slot.ideaId);
  const next = pool[Math.floor(rand() * pool.length)] ?? bank.find((i) => i.id === slot.ideaId) ?? IDEAS.find((i) => i.format === slot.format)!;
  const fresh = slotFromIdea(next, slot.date, slot.time, slot.id);
  return { ...fresh, media: slot.media, music: slot.music, status: slot.media.length ? slot.status : "idea", updatedAt: new Date().toISOString() };
}

/**
 * Plan every week from `from` to `to` that has never been planned and has no
 * slots yet. Shared by the app and by Claude's monthly run, so both plan the
 * same way.
 * @returns the new slots and every week now counted as planned
 */
export function planRange(
  from: string,
  to: string,
  existing: Slot[],
  generated: Iterable<string>,
  bank: Idea[],
  thisWeek: string,
): { fresh: Slot[]; newWeeks: string[] } {
  const done = new Set(generated);
  const all = [...existing];
  const fresh: Slot[] = [];
  const newWeeks: string[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
    if (w < thisWeek || done.has(w)) continue;
    newWeeks.push(w);
    if (all.some((s) => s.date >= w && s.date <= addDays(w, 6))) continue;
    const planned = planWeek(w, all, { ideas: bank });
    all.push(...planned);
    fresh.push(...planned);
  }
  return { fresh, newWeeks };
}

/** Settings key holding ideas Claude added on its monthly run. */
export const EXTRA_IDEAS_KEY = "extraIdeas";

/** Built-in ideas: the starter bank plus the ideas from the Drive playbook doc. */
export const BUILT_IN_IDEAS: Idea[] = [...IDEAS, ...DOC_IDEAS];

/** The built-in bank plus Claude's ideas. A Claude idea with a built-in id is ignored. */
export function ideaBank(extra: Idea[] | null | undefined): Idea[] {
  if (!extra?.length) return BUILT_IN_IDEAS;
  const ids = new Set(BUILT_IN_IDEAS.map((i) => i.id));
  return [...BUILT_IN_IDEAS, ...extra.filter((i) => i && !ids.has(i.id) && i.format && i.title)];
}

export { PILLARS };
