import { addDays, toUTC } from "./dates";
import { channelCta, CHANNEL_LABEL, type Channel } from "./playbook";
import type { Format, Idea, Pillar, ProductFamily } from "./types";

/**
 * Events, sales and campaigns on the calendar, and what to post around them.
 *
 * Stored in the shared settings key `events` (a BrandEvent[]). The app seeds it
 * with DEFAULT_EVENTS: the campaigns in Carli's Drive doc plus researched
 * Amazon.co.za and Takealot sale dates. People add their own, or paste a year
 * calendar in on the Year ahead page.
 */

export type EventKind = "sale" | "marketplace" | "holiday" | "campaign" | "market" | "launch";

export const KIND_LABEL: Record<EventKind, string> = {
  sale: "Our sale",
  marketplace: "Amazon / Takealot deal",
  holiday: "Holiday",
  campaign: "Campaign",
  market: "Market or pop-up",
  launch: "Launch",
};

export interface BrandEvent {
  id: string;
  title: string;
  kind: EventKind;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day. Missing = a one-day event. */
  end?: string;
  /** Where people can buy during it. Sets the call to action. */
  channels?: Channel[];
  /** Last day to submit the deal on the marketplace (Amazon Seller Central, Takealot Seller Portal). */
  submitBy?: string;
  /** How many days before the start to begin talking about it. Defaults by kind. */
  leadDays?: number;
  /** The angle: what to say, which products, anything to remember. */
  notes?: string;
  products?: ProductFamily[];
  /** The dates are our best estimate. Confirm them, then untick. */
  estimated?: boolean;
  /** Repeat every month or year on the same dates. */
  repeat?: "monthly" | "yearly";
  source: "doc" | "researched" | "added" | "imported";
  /** A built-in event someone removed. Kept so it isn't seeded again. */
  hidden?: boolean;
}

export const EVENTS_KEY = "events";
/** Bump when DEFAULT_EVENTS gains entries, so they're added to the saved list once. */
export const EVENTS_SEED_VERSION = 1;
export const EVENTS_SEED_KEY = "eventsSeedVersion";

const LEAD: Record<EventKind, number> = {
  sale: 14,
  marketplace: 10,
  holiday: 21,
  campaign: 0,
  market: 14,
  launch: 21,
};

export function leadDays(e: BrandEvent) {
  return e.leadDays ?? LEAD[e.kind];
}

export function lastDay(e: BrandEvent) {
  return e.end && e.end > e.start ? e.end : e.start;
}

const ev = (e: Omit<BrandEvent, "source"> & { source?: BrandEvent["source"] }): BrandEvent => ({ source: "researched", ...e });
const doc = (e: Omit<BrandEvent, "source">): BrandEvent => ({ ...e, source: "doc" });

const HOME: ProductFamily[] = ["Baskets", "Round Bowls", "Planters"];
const TABLE: ProductFamily[] = ["Placemats", "Trivets", "Coasters", "Table Runner"];
const GIFT: ProductFamily[] = ["Trivets", "Coasters", "Round Bowls", "Baskets"];

/**
 * Built-in events. "doc" ones come from the Drive doc's seasonal campaign
 * calendar. "researched" ones are public sale dates (sources in the PR) or
 * fixed South African dates; the marketplace ones for 2027 are estimates.
 */
export const DEFAULT_EVENTS: BrandEvent[] = [
  // ── Festive 2026 (doc: rolling 6-week runway) ──
  ev({ id: "takealot-bf-specials-2026", title: "Takealot Black Friday specials", kind: "marketplace", start: "2026-10-26", end: "2026-11-23", channels: ["takealot"],
    notes: "Takealot's weekly rotating Black Friday specials (announced for 26 Oct to 23 Nov 2026)." }),
  doc({ id: "hostess-guide-2026", title: "Festive: the hostess gift guide", kind: "campaign", start: "2026-11-02", end: "2026-11-15", channels: ["amazon", "takealot", "website"], products: ["Trivets", "Coasters"],
    notes: "Trivet sets and coasters as the ultimate thank-you gift for dinner-party hosts." }),
  doc({ id: "home-org-2026", title: "Festive: home organisation push", kind: "campaign", start: "2026-11-20", end: "2026-11-30", channels: ["amazon", "takealot"], products: ["Baskets"],
    notes: "Rope storage baskets for tidying toys and clutter before family visits." }),
  ev({ id: "black-friday-2026", title: "Black Friday", kind: "marketplace", start: "2026-11-27", channels: ["amazon", "takealot", "website"], leadDays: 10,
    notes: "Takealot's main Black Friday day starts at midnight on 27 Nov. Keep it calm and beautiful: a gift-worthy deal, not a shouty sale." }),
  ev({ id: "cyber-monday-2026", title: "Cyber Monday", kind: "marketplace", start: "2026-11-30", channels: ["amazon", "takealot"], leadDays: 3,
    notes: "Last online deal day of Black Friday weekend." }),
  doc({ id: "gift-of-day-2026", title: "Gift idea of the day (stories)", kind: "campaign", start: "2026-12-01", end: "2026-12-20", channels: ["amazon", "takealot", "yaga"], products: GIFT,
    notes: "Daily story: one gift idea with a link sticker to the right platform and a countdown sticker." }),
  doc({ id: "last-minute-2026", title: "Festive: last-minute convenience", kind: "campaign", start: "2026-12-07", end: "2026-12-18", channels: ["amazon", "takealot"], products: GIFT,
    notes: "Order instantly on Amazon.co.za or Takealot to beat the courier rush before Christmas." }),
  ev({ id: "christmas-2026", title: "Christmas", kind: "holiday", start: "2026-12-25", leadDays: 10, products: TABLE,
    notes: "Festive tables, gathering, thank-you to customers." }),

  // ── 2027 ──
  ev({ id: "new-year-reset-2027", title: "New year home reset", kind: "campaign", start: "2027-01-04", end: "2027-01-17", products: HOME,
    notes: "Calm, uncluttered homes for the new year: baskets for tidying, a fresh table." }),
  ev({ id: "valentines-2027", title: "Valentine's Day", kind: "holiday", start: "2027-02-14", leadDays: 14, channels: ["amazon", "takealot", "website"], products: TABLE,
    notes: "A table for two. Gifting that lasts." }),
  doc({ id: "easter-autumn-2027", title: "Easter & autumn refresh", kind: "campaign", start: "2027-03-15", end: "2027-04-05", channels: ["website", "yaga"], products: ["Placemats", "Trivets", "Table Runner"],
    notes: "Cosy, warm, earthy tones as the weather cools. Styled autumn tablescape with deep green or natural placemats and warm candles." }),
  ev({ id: "easter-2027", title: "Easter weekend", kind: "holiday", start: "2027-03-26", end: "2027-03-29", leadDays: 10, products: TABLE,
    notes: "Good Friday 26 Mar to Family Day 29 Mar. Family gatherings around the table." }),
  doc({ id: "mothers-day-2027", title: "Mother's Day", kind: "holiday", start: "2027-05-09", leadDays: 21, channels: ["amazon", "takealot", "shop"], products: ["Baskets", "Trivets"],
    notes: "For the heart of the home. Basket filled with bath treats or a plant, as thoughtful gifting. Amazon/Takealot for delivery to mom's door, plus the Knysna workshop." }),
  ev({ id: "fathers-day-2027", title: "Father's Day", kind: "holiday", start: "2027-06-20", leadDays: 14, channels: ["amazon", "takealot"], products: ["Coasters", "Trivets"],
    notes: "Coasters and trivets for the braai and the bar. Keep it light." }),
  ev({ id: "prime-day-2027", title: "Amazon Prime Day", kind: "marketplace", start: "2027-06-22", end: "2027-06-28", channels: ["amazon"], submitBy: "2027-06-08", estimated: true,
    notes: "SA's first Prime Day ran 23 to 29 June 2026, with deals due 9 June (2 weeks before). 2027 dates are an estimate: watch Seller Central from early May." }),
  ev({ id: "takealot-midyear-2027", title: "Takealot mid-year sale", kind: "marketplace", start: "2027-07-12", end: "2027-07-18", channels: ["takealot"], submitBy: "2027-06-25", estimated: true,
    notes: "Takealot has run mid-year ('Black Friday in July') sales. Dates are a placeholder: confirm in the Seller Portal and delete this if there's none." }),
  doc({ id: "heritage-month-2027", title: "Heritage Month: proudly SA", kind: "campaign", start: "2027-09-01", end: "2027-09-30", channels: ["website", "yaga", "shop"],
    notes: "Local craftsmanship, Knysna, 100% South African made. Behind-the-scenes reel of raw rope transformed in the workshop, with \"Proudly handmade in South Africa\"." }),
  ev({ id: "heritage-day-2027", title: "Heritage Day", kind: "holiday", start: "2027-09-24", leadDays: 7, notes: "Public holiday." }),
  ev({ id: "takealot-bf-specials-2027", title: "Takealot Black Friday specials", kind: "marketplace", start: "2027-10-25", end: "2027-11-22", channels: ["takealot"], submitBy: "2027-10-01", estimated: true,
    notes: "Based on 2026 (26 Oct to 23 Nov). Confirm dates and the deal deadline in the Takealot Seller Portal. Deal stock must be in the warehouse 2 business days before the start." }),
  doc({ id: "hostess-guide-2027", title: "Festive: the hostess gift guide", kind: "campaign", start: "2027-11-01", end: "2027-11-14", channels: ["amazon", "takealot", "website"], products: ["Trivets", "Coasters"],
    notes: "Trivet sets and coasters as the ultimate thank-you gift for dinner-party hosts." }),
  doc({ id: "home-org-2027", title: "Festive: home organisation push", kind: "campaign", start: "2027-11-19", end: "2027-11-29", channels: ["amazon", "takealot"], products: ["Baskets"],
    notes: "Rope storage baskets for tidying toys and clutter before family visits." }),
  ev({ id: "black-friday-2027", title: "Black Friday", kind: "marketplace", start: "2027-11-26", channels: ["amazon", "takealot", "website"], submitBy: "2027-10-15", leadDays: 10, estimated: true,
    notes: "Black Friday is always the Friday after the 4th Thursday of November. Deal deadline is an estimate: check Seller Central and the Seller Portal in early October." }),
  ev({ id: "cyber-monday-2027", title: "Cyber Monday", kind: "marketplace", start: "2027-11-29", channels: ["amazon", "takealot"], leadDays: 3 }),
  doc({ id: "gift-of-day-2027", title: "Gift idea of the day (stories)", kind: "campaign", start: "2027-12-01", end: "2027-12-20", channels: ["amazon", "takealot", "yaga"], products: GIFT,
    notes: "Daily story: one gift idea with a link sticker to the right platform and a countdown sticker." }),
  doc({ id: "last-minute-2027", title: "Festive: last-minute convenience", kind: "campaign", start: "2027-12-06", end: "2027-12-17", channels: ["amazon", "takealot"], products: GIFT,
    notes: "Order instantly on Amazon.co.za or Takealot to beat the courier rush before Christmas." }),
  ev({ id: "christmas-2027", title: "Christmas", kind: "holiday", start: "2027-12-25", leadDays: 10, products: TABLE }),
];

/** Add any built-in events the saved list has never had. Hidden ones stay hidden. */
export function mergeDefaults(saved: BrandEvent[] | null): BrandEvent[] {
  const list = saved ? [...saved] : [];
  const ids = new Set(list.map((e) => e.id));
  for (const e of DEFAULT_EVENTS) if (!ids.has(e.id)) list.push(e);
  return sortEvents(list);
}

export function sortEvents(list: BrandEvent[]) {
  return [...list].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function shiftMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** One dated run of an event. Repeating events give one per month or year. */
export interface Occurrence extends BrandEvent {
  /** The saved event's id; `id` is made unique per repeat. */
  eventId: string;
}

/** Every visible run of every event that touches [from, to], including its lead-up and submit date. */
export function occurrences(events: BrandEvent[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    if (e.hidden) continue;
    const step = e.repeat === "monthly" ? 1 : e.repeat === "yearly" ? 12 : 0;
    for (let i = 0; i < (step ? 400 : 1); i++) {
      const start = step ? shiftMonths(e.start, i * step) : e.start;
      if (start > addDays(to, 60)) break;
      const end = e.end ? (step ? shiftMonths(e.end, i * step) : e.end) : undefined;
      const submitBy = e.submitBy ? (step ? shiftMonths(e.submitBy, i * step) : e.submitBy) : undefined;
      const occ: Occurrence = { ...e, eventId: e.id, id: step ? `${e.id}@${start}` : e.id, start, end, submitBy };
      const earliest = [addDays(start, -leadDays(occ)), submitBy ? addDays(submitBy, -7) : start].sort()[0];
      const latest = addDays(lastDay(occ), 3);
      if (latest >= from && earliest <= to) out.push(occ);
    }
  }
  return sortEvents(out) as Occurrence[];
}

/** Events happening on this exact day (not their lead-up). */
export function eventsOn(date: string, events: BrandEvent[]): Occurrence[] {
  return occurrences(events, date, date).filter((e) => e.start <= date && lastDay(e) >= date);
}

export type Phase = "submit" | "build-up" | "announce" | "launch" | "during" | "last-chance" | "after";

export const PHASE_LABEL: Record<Phase, string> = {
  submit: "Submit the deal",
  "build-up": "Build-up",
  announce: "Announce",
  launch: "Starts today",
  during: "On now",
  "last-chance": "Last chance",
  after: "Thank you",
};

export interface EventMoment {
  event: Occurrence;
  phase: Phase;
  /** Days until the start (negative once it's started). */
  daysToStart: number;
  /** A to-do rather than a post, e.g. submitting the marketplace deal. */
  task?: string;
  /** How strongly this day's content should lean into the event, 0 to 1. */
  weight: number;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / DAY);

/** Where each event stands on a date, most pressing first. */
export function momentsOn(date: string, events: BrandEvent[]): EventMoment[] {
  const out: EventMoment[] = [];
  for (const e of occurrences(events, date, date)) {
    const toStart = daysBetween(date, e.start);
    const end = lastDay(e);
    const multiDay = end > e.start;
    const selling = e.kind === "sale" || e.kind === "marketplace" || e.kind === "market" || e.kind === "launch";
    if (e.submitBy && date <= e.submitBy && daysBetween(date, e.submitBy) <= 7) {
      out.push({ event: e, phase: "submit", daysToStart: toStart, weight: 0,
        task: `Submit the ${e.title} deal on ${(e.channels ?? []).filter((c) => c === "amazon" || c === "takealot").map((c) => CHANNEL_LABEL[c]).join(" and ") || "the marketplace"} by ${e.submitBy}.` });
    }
    let phase: Phase | null = null;
    let weight = 0;
    const lead = leadDays(e);
    if (date === e.start) { phase = "launch"; weight = 0.8; }
    else if (date > e.start && date <= end) {
      const left = daysBetween(date, end);
      if (multiDay && left <= 1 && selling) { phase = "last-chance"; weight = 0.7; }
      else { phase = "during"; weight = e.kind === "campaign" ? 0.5 : 0.6; }
    } else if (toStart > 0 && toStart <= Math.min(7, lead)) { phase = "announce"; weight = selling ? 0.5 : 0.4; }
    else if (toStart > 0 && toStart <= lead) { phase = "build-up"; weight = 0.25; }
    else if (date > end && daysBetween(end, date) <= 3 && selling) { phase = "after"; weight = 0.15; }
    if (phase) out.push({ event: e, phase, daysToStart: toStart, weight });
  }
  const rank: Record<Phase, number> = { submit: 0, launch: 1, "last-chance": 2, during: 3, announce: 4, "build-up": 5, after: 6 };
  return out.sort((a, b) => rank[a.phase] - rank[b.phase] || b.weight - a.weight);
}

/**
 * Keep the mix balanced: at most this share of a week's posts should be about
 * events. The rest stays evergreen (styling, craft, community).
 */
export const MAX_EVENT_SHARE = 0.6;

/**
 * How many of `count` suggestions should be about events on this date.
 * Never all of them: the doc's always-on styling and social proof keep going.
 */
export function eventShare(date: string, events: BrandEvent[], count: number): number {
  const top = momentsOn(date, events).filter((m) => m.phase !== "submit");
  if (!top.length) return 0;
  const w = Math.min(MAX_EVENT_SHARE, Math.max(...top.map((m) => m.weight)));
  return Math.max(1, Math.round(count * w));
}

// ───────────── Event idea templates ─────────────

const KIND_PILLAR: Record<EventKind, Pillar> = {
  sale: "Product",
  marketplace: "Product",
  holiday: "Lifestyle",
  campaign: "Lifestyle",
  market: "Community",
  launch: "Brand story",
};

interface Template {
  title: string;
  prompt: string;
  shots: string[];
  caption: string;
}

function templates(e: BrandEvent, phase: Phase, format: Format): Template[] {
  // "Festive: the hostess gift guide" reads better as "The hostess gift guide" inside a title.
  const short = e.title.includes(": ") ? e.title.split(": ").slice(1).join(": ") : e.title;
  const t = short.charAt(0).toUpperCase() + short.slice(1);
  const what = e.notes ? ` ${e.notes}` : "";
  const product = e.products?.[0]?.toLowerCase() ?? "pieces";
  const story = format === "story";
  const selling = e.kind === "sale" || e.kind === "marketplace";
  switch (phase) {
    case "build-up":
      return [
        { title: `${t}: set the scene`, prompt: `Gentle build-up to ${t}. Show the ${product} in a styled home moment that fits the occasion, without mentioning a deal yet.${what}`,
          shots: ["Wide styled scene on the signature table", `Close-up of the ${product} texture`, "Hands placing a piece"],
          caption: `${t} is around the corner. We're slowly getting the house ready.` },
        { title: `${t}: gift or styling idea`, prompt: `A saveable styling or gifting idea tied to ${t}.${what}`,
          shots: ["Flat lay with linen and greenery", "Detail shot", "Final styled frame"],
          caption: `A small idea for ${t}: one considered piece, beautifully made.` },
        ...(story ? [{ title: `Poll: ${t} plans?`, prompt: `Story poll or question sticker about ${t} plans, to warm people up.`,
          shots: ["Soft styled background", "Poll sticker"], caption: `Any plans for ${t}?` }] : []),
      ];
    case "announce":
      return [
        { title: selling ? `Coming soon: ${t}` : `${t} is almost here`, prompt: `Announce ${t} in advance${e.start ? `, starting ${e.start}` : ""}. Beautiful product photography with a calm caption that explains what's on and where.${what}`,
          shots: ["Hero product shot on a neutral backdrop", "Lifestyle shot of the piece in use", "Close-up detail"],
          caption: selling ? `Mark your calendar: ${t} starts soon.` : `${t} is almost here. Here's how we're setting the table.` },
        ...(story ? [{ title: `Countdown: ${t}`, prompt: `Countdown sticker story for ${t}, so followers get a reminder when it starts.`,
          shots: ["Product on the signature table", "Countdown sticker"], caption: `Tap the countdown so you don't miss ${t}.` }] : []),
        { title: `${t}: what to look out for`, prompt: `Show 2 or 3 pieces that will feature in ${t} and who they suit.${what}`,
          shots: e.products?.length ? e.products.slice(0, 3).map((p) => `${p} styled simply`) : ["Three pieces side by side", "Each one in use"],
          caption: `Three pieces we think you'll love for ${t}.` },
      ];
    case "launch":
      return [
        { title: selling ? `${t} is on` : `Happy ${t}`, prompt: selling ? `${t} starts today. Elegant product shot, caption explains the deal and links to where to buy.${what}` : `Mark ${t} warmly with a styled scene.${what}`,
          shots: ["Hero shot in soft light", "The piece in use", "Close-up texture"],
          caption: selling ? `${t} starts today.` : `Happy ${t} from all of us at Roopip.` },
        ...(story ? [{ title: `${t}: link sticker`, prompt: `Story with a link sticker straight to where the ${t} deal is.`,
          shots: ["Product photo", "Link sticker"], caption: `${t} is live. Tap the link.` }] : []),
      ];
    case "during":
      return [
        { title: selling ? `Reminder: ${t} is on` : `${t}: idea of the day`, prompt: selling ? `Friendly reminder during ${t}, featuring a different piece than the launch post.${what}` : `One idea for ${t}: a single piece, styled simply.${what}`,
          shots: ["A different piece than last time", "In use, in a calm home", "Detail"],
          caption: selling ? `${t} is still on.` : `Today's idea for ${t}.` },
        { title: `${t}: styled for real life`, prompt: `Show how a piece from ${t} lives in a real home, so it feels inspiring rather than salesy.${what}`,
          shots: ["Customer-style home shot", "Wide shot with negative space"],
          caption: `Made to be used every day, long after ${t}.` },
      ];
    case "last-chance":
      return [
        { title: `Last chance: ${t}`, prompt: `Final reminder: ${t} ends ${lastDay(e)}. Calm, not pushy.${what}`,
          shots: ["Hero product shot", "Countdown or end-date sticker"], caption: `${t} ends soon.` },
      ];
    case "after":
      return [
        { title: `Thank you: ${t}`, prompt: `Thank people for supporting ${t}. Show parcels going out or a happy customer.`,
          shots: ["Parcels being packed", "Thank-you card close-up"], caption: `Thank you for all the love during ${t}. Your parcels are on their way.` },
      ];
    default:
      return [];
  }
}

/** Suggested ideas for one event on one date and format. */
export function eventIdeas(m: EventMoment, format: Format): Idea[] {
  const e = m.event;
  return templates(e, m.phase, format).map((t, i) => ({
    id: `event:${e.id}:${m.phase}:${format}:${i}`,
    format,
    pillar: KIND_PILLAR[e.kind],
    product: e.products?.[0],
    title: t.title,
    prompt: t.prompt,
    shots: t.shots,
    caption: t.caption,
    hashtags: e.kind === "marketplace" ? ["#giftideas", "#homedecor"] : ["#homedecor"],
    cta: channelCta(e.channels),
  }));
}

// ───────────── Importing a year calendar ─────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Read a date like 2027-03-14, 14/03/2027, 14 March 2027 or March 14 2027. */
export function parseDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]+)\s*(\d{4})?$/);
  if (m && month(m[2])) return iso(m[3] ? +m[3] : fallbackYear ?? new Date().getFullYear(), month(m[2])!, +m[1]);
  m = s.match(/^([a-z]+)\s+(\d{1,2})\s*(\d{4})?$/);
  if (m && month(m[1])) return iso(m[3] ? +m[3] : fallbackYear ?? new Date().getFullYear(), month(m[1])!, +m[2]);
  return null;
}

function month(name: string) {
  const i = MONTHS.indexOf(name.slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function guessKind(text: string): EventKind {
  const t = text.toLowerCase();
  if (/amazon|takealot|prime day|black friday|cyber monday/.test(t)) return "marketplace";
  if (/market|pop.?up|fair|expo/.test(t)) return "market";
  if (/launch|new colou?r|collection|website/.test(t)) return "launch";
  if (/sale|discount|% off|special/.test(t)) return "sale";
  if (/day|christmas|easter|holiday|valentine/.test(t)) return "holiday";
  return "campaign";
}

function guessChannels(text: string): Channel[] | undefined {
  const t = text.toLowerCase();
  const out: Channel[] = [];
  if (t.includes("amazon")) out.push("amazon");
  if (t.includes("takealot")) out.push("takealot");
  if (t.includes("yaga")) out.push("yaga");
  if (/website|online shop/.test(t)) out.push("website");
  if (/shop|store|knysna|queen/.test(t) && !out.length) out.push("shop");
  return out.length ? out : undefined;
}

/**
 * Turn pasted rows into events. Each line is a date (or "date to date", or two
 * date columns), then the title, then optional notes. Columns can be split by
 * tabs (pasted from a spreadsheet), commas or " | ". A header row is skipped.
 */
export function parseEvents(text: string, year?: number): { events: BrandEvent[]; skipped: string[] } {
  const events: BrandEvent[] = [];
  const skipped: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = (line.includes("\t") ? line.split("\t") : line.includes("|") ? line.split("|") : splitCsv(line)).map((c) => c.trim());
    let start: string | null = null;
    let end: string | null = null;
    let rest = cols;
    const range = cols[0].split(/\s+(?:to|until|till|-|–|—)\s+/i);
    if (range.length === 2) {
      start = parseDate(range[0], year);
      end = parseDate(range[1], start ? +start.slice(0, 4) : year);
      rest = cols.slice(1);
    } else {
      start = parseDate(cols[0], year);
      rest = cols.slice(1);
      const maybeEnd = cols[1] ? parseDate(cols[1], start ? +start.slice(0, 4) : year) : null;
      if (maybeEnd) { end = maybeEnd; rest = cols.slice(2); }
    }
    const title = rest[0];
    if (!start || !title) { skipped.push(line); continue; }
    const notes = rest.slice(1).filter(Boolean).join(" · ") || undefined;
    const all = `${title} ${notes ?? ""}`;
    events.push({
      id: `import-${start}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
      title,
      kind: guessKind(all),
      start,
      end: end && end > start ? end : undefined,
      channels: guessChannels(all),
      notes,
      source: "imported",
    });
  }
  return { events, skipped };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  // "14 March, 2027" style dates get split by the comma; glue a lone year back on.
  if (out.length > 1 && /^\s*\d{4}\s*$/.test(out[1]) && !/\d{4}/.test(out[0])) out.splice(0, 2, `${out[0]} ${out[1].trim()}`);
  return out;
}
