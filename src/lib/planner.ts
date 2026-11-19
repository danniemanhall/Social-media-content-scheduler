import { IDEAS } from "./ideas";
import { DOC_IDEAS } from "./playbook";
import { PILLARS } from "./brand";
import { addDays, monthOf, toUTC, weekStart } from "./dates";
import type { Format, Idea, Slot, TemplateSlot } from "./types";

/**
 * Default week: 1 reel, 2 grid posts (one carousel, one single image),
 * 3 story days, plus an optional Sunday story. Times are Johannesburg time.
 */
export const DEFAULT_TEMPLATE: TemplateSlot[] = [
  { dow: 1, kind: "reel", time: "18:30" },
  { dow: 1, kind: "story", time: "08:00" },
  { dow: 3, kind: "grid", time: "18:30" },
  { dow: 3, kind: "story", time: "08:00" },
  { dow: 5, kind: "grid", time: "12:30" },
  { dow: 6, kind: "story", time: "09:00" },
  { dow: 7, kind: "story", time: "10:00", optional: true },
];

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
 * Plan one week of slots.
 * @param weekStartISO the Monday of the week
 * @param history slots from earlier weeks (used for cool-down and product rotation)
 */
export function planWeek(weekStartISO: string, history: Slot[], opts: PlanOptions = {}): Slot[] {
  const template = (opts.template ?? DEFAULT_TEMPLATE).filter(
    (t) => opts.includeOptional || !t.optional,
  );
  const bank = opts.ideas ?? IDEAS;
  const rand = rng(weekStartISO);
  const cutoff = addDays(weekStartISO, -7 * COOLDOWN_WEEKS);
  const prior = history
    .filter((s) => s.date < weekStartISO && s.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const recentIdeaIds = new Set(prior.map((s) => s.ideaId));
  const lastWithProduct = [...prior].reverse().find((s) => s.product);

  const ctx: PickContext = {
    month: monthOf(addDays(weekStartISO, 3)),
    recentIdeaIds,
    usedThisWeek: new Set(),
    pillarsThisWeek: new Set(),
    lastProduct: lastWithProduct?.product,
    rand,
    slotsLeft: template.length,
  };

  const [gridA, gridB] = gridFormats(weekStartISO);
  let gridCount = 0;
  const ordered = [...template].sort((a, b) => a.dow - b.dow || a.time.localeCompare(b.time));

  return ordered.map((t, n) => {
    let format: Format;
    if (t.kind === "grid") format = gridCount++ % 2 === 0 ? gridA : gridB;
    else format = t.kind;
    const candidates = bank.filter((i) => i.format === format);
    ctx.slotsLeft = ordered.length - n;
    const chosen = pickIdea(candidates, ctx);
    ctx.usedThisWeek.add(chosen.id);
    ctx.pillarsThisWeek.add(chosen.pillar);
    if (chosen.product) ctx.lastProduct = chosen.product;
    const date = addDays(weekStartISO, t.dow - 1);
    return slotFromIdea(chosen, date, t.time, `${date}-${t.kind}-${t.time.replace(":", "")}`);
  });
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
