import { BRAND } from "./brand";
import { addDays, monthOf, weekStart } from "./dates";
import type { Format, Idea, Pillar, Slot } from "./types";

/**
 * Suggestions for the guided post flow: ideas for an open slot, then
 * captions, calls to action, hashtags and music for the idea chosen.
 * Everything is worked out in the browser from the idea bank (the built-in
 * ideas plus Claude's monthly ones), so it's instant and free.
 */

export const formatsFor = (format: Format): Format[] => (format === "post" || format === "carousel" ? ["post", "carousel"] : [format]);

/** Small deterministic PRNG so the same slot lists ideas in the same order. */
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

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/(?<!s)s$/, ""));
const STOP = new Set(["the", "and", "for", "with", "our", "your", "you", "are", "that", "this", "from", "into", "one", "how", "what", "some", "about", "post", "story", "reel", "idea", "ideas", "want"]);

export interface RankedIdea {
  idea: Idea;
  /** Short reasons it's suggested, e.g. "In season", "Not used lately". */
  why: string[];
  /** Matches the words typed in "Suggest ideas about…". */
  matched: boolean;
}

/**
 * Ideas for a slot, best first. Balances the week (pillars the week hasn't
 * had yet come first), keeps seasonal ideas to their months, rests ideas used
 * in the last 8 weeks, avoids the same product twice in a row, and puts ideas
 * matching `query` on top.
 */
export function rankIdeas(slot: Pick<Slot, "id" | "date" | "format">, bank: Idea[], history: Slot[], query = ""): RankedIdea[] {
  const month = monthOf(slot.date);
  const formats = formatsFor(slot.format);
  const ws = weekStart(slot.date);
  const others = history.filter((s) => s.id !== slot.id && s.ideaId);
  const recent = new Set(others.filter((s) => s.date >= addDays(slot.date, -56) && s.date <= addDays(slot.date, 56)).map((s) => s.ideaId));
  const week = others.filter((s) => weekStart(s.date) === ws);
  const weekPillars = new Set(week.map((s) => s.pillar));
  const before = others.filter((s) => s.date < slot.date && s.product).sort((a, b) => a.date.localeCompare(b.date));
  const lastProduct = before.at(-1)?.product;
  const want = words(query);
  const rand = rng(slot.id);

  const out: (RankedIdea & { score: number })[] = [];
  for (const idea of bank) {
    if (!formats.includes(idea.format)) continue;
    const seasonal = !!idea.months?.length;
    if (seasonal && !idea.months!.includes(month)) continue;
    const why: string[] = [];
    let score = rand();
    if (seasonal) {
      score += 1.5;
      why.push("In season");
    }
    if (recent.has(idea.id)) score -= 10;
    else why.push("Not used lately");
    if (!weekPillars.has(idea.pillar)) {
      score += 1;
      if (week.length) why.push(`Adds ${idea.pillar.toLowerCase()} to the week`);
    }
    if (idea.product && idea.product === lastProduct) score -= 2;
    let matched = false;
    if (want.length) {
      const text = new Set(words(`${idea.title} ${idea.prompt} ${idea.shots.join(" ")} ${idea.pillar} ${idea.product ?? ""} ${idea.caption}`));
      const hits = want.filter((w) => text.has(w)).length;
      if (hits) {
        matched = true;
        score += 20 + hits * 5;
      }
    }
    if (idea.id.startsWith("claude-")) why.push("New from Claude");
    out.push({ idea, why, matched, score });
  }
  return out.sort((a, b) => b.score - a.score).map(({ score: _s, ...r }) => r);
}

/** Copies an idea into a slot, keeping the slot's date, time, media and progress. */
export function applyIdea(slot: Slot, idea: Idea): Slot {
  return {
    ...slot,
    ideaId: idea.id,
    // A grid slot takes the idea's grid layout; an idea written for a story or reel becomes a single post.
    format: slot.format === "post" || slot.format === "carousel" ? (idea.format === "carousel" ? "carousel" : "post") : slot.format,
    pillar: idea.pillar,
    product: idea.product,
    title: idea.title,
    prompt: idea.prompt,
    shots: [...idea.shots],
    shotsChosen: undefined,
    caption: idea.caption,
    hashtags: [...idea.hashtags],
    cta: idea.cta,
  };
}

const sentences = (s: string) => s.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? (s.trim() ? [s.trim()] : []);

const CLAIM_FOR: Record<Pillar, string> = {
  Product: "Handmade in Knysna, South Africa.",
  Lifestyle: "Handmade in Knysna, South Africa, for calm, considered homes.",
  Craftsmanship: "Every piece is handmade in Knysna, South Africa.",
  Education: "Handmade in Knysna, South Africa, to be used every day.",
  "Brand story": "Our cotton rope is sun-dyed by hand in small batches, without electricity.",
  Community: "Handmade in Knysna, South Africa.",
};

const QUESTION_FOR: Record<Pillar, string> = {
  Product: "Which colour would you choose for your home?",
  Lifestyle: "Where would this live in your home?",
  Craftsmanship: "Would you like to see more of how it's made?",
  Education: "Any questions about caring for your pieces? Ask below.",
  "Brand story": "What does slow, handmade mean to you?",
  Community: "Tag someone who would love this.",
};

/** Caption options: the idea's own, a short one, one with a brand fact, one ending on a question, plus Claude's. */
export function captionOptions(slot: Pick<Slot, "caption" | "pillar" | "title" | "captionOptions">, ideaCaption?: string): string[] {
  const base = (ideaCaption ?? slot.caption).trim();
  const first = sentences(base)[0] ?? slot.title;
  const claim = CLAIM_FOR[slot.pillar];
  const options = [
    base,
    first,
    base.includes(claim.slice(0, 20)) ? "" : `${first} ${claim}`,
    `${base}\n\n${QUESTION_FOR[slot.pillar]}`,
    ...(slot.captionOptions ?? []),
  ];
  return [...new Set(options.map((o) => o.trim()).filter(Boolean))];
}

const CTAS: Record<Pillar, string[]> = {
  Product: ["Shop the range via the link in our bio.", "Send us a message to order yours.", "Save this for your next home refresh."],
  Lifestyle: ["Save this for styling inspiration.", "Shop the look via the link in our bio.", "Share this with someone setting up a new home."],
  Craftsmanship: ["Follow along to see what we make next.", "Shop handmade pieces via the link in our bio.", "Save this to remember how it's made."],
  Education: ["Save this for later.", "Share it with someone who'd find it useful.", "Questions? Ask us in the comments."],
  "Brand story": ["Follow along for more from our Knysna workspace.", "Shop the range via the link in our bio.", "Share our story with a friend."],
  Community: ["Tag a friend who'd love this.", "Share your Roopip pieces with #roopip.", "Tell us in the comments."],
};

export function ctaOptions(slot: Pick<Slot, "pillar" | "cta" | "format">, ideaCta?: string): string[] {
  const story = slot.format === "story" ? ["Tap the link sticker to shop.", "Reply to this story and tell us."] : [];
  return [...new Set([ideaCta ?? slot.cta, ...CTAS[slot.pillar], ...story].map((c) => c.trim()).filter(Boolean))];
}

/** Instagram allows at most 5 hashtags a post (since December 2025). */
export const HASHTAG_LIMIT = 5;

const PRODUCT_TAG: Record<string, string> = {
  Placemats: "#placemats",
  Trivets: "#trivets",
  Coasters: "#coasters",
  "Table Runner": "#tablerunner",
  "Round Bowls": "#ropebowl",
  "Oval Bowls": "#ropebowl",
  Planters: "#planters",
  "Clip-On Hangers": "#plantlover",
  Baskets: "#ropebasket",
  "Carrier Bags": "#ropebag",
};
const PILLAR_TAGS: Record<Pillar, string[]> = {
  Product: ["#homedecor", "#interiorstyling"],
  Lifestyle: ["#calmhome", "#slowliving", "#neutralinteriors"],
  Craftsmanship: ["#handmade", "#makersgonnamake"],
  Education: ["#homecare", "#interiortips"],
  "Brand story": ["#smallbusiness", "#knysna"],
  Community: ["#supportlocal", "#localislekker"],
};

/** Hashtag options, most useful first; the first five are picked by default. */
export function hashtagOptions(slot: Pick<Slot, "hashtags" | "pillar" | "product">): string[] {
  const tags = [
    "#roopip",
    ...slot.hashtags,
    slot.product ? PRODUCT_TAG[slot.product] : "",
    "#handmadeinknysna",
    ...PILLAR_TAGS[slot.pillar],
    ...BRAND.baseHashtags,
    "#madeinsouthafrica",
    "#ropedecor",
  ];
  return [...new Set(tags.filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`).toLowerCase()))];
}

export interface Mood {
  label: string;
  /** Words looked for in track names in the music folder. */
  words: string[];
  /** Search on Pixabay Music (free for commercial use, no credit needed). */
  search: string;
  /** Search in the free music library (Openverse); one or two words work best there. */
  free: string;
}

const MOODS: Record<Pillar, Mood[]> = {
  Craftsmanship: [
    { label: "Calm acoustic guitar", words: ["acoustic", "guitar", "calm"], search: "calm acoustic guitar", free: "acoustic" },
    { label: "Soft piano", words: ["piano", "soft"], search: "soft piano", free: "piano" },
  ],
  Lifestyle: [
    { label: "Warm lo-fi", words: ["lofi", "lo-fi", "chill", "warm"], search: "warm lofi", free: "chill" },
    { label: "Light jazz", words: ["jazz", "cafe"], search: "light jazz cafe", free: "jazz" },
  ],
  Product: [
    { label: "Minimal piano", words: ["piano", "minimal"], search: "minimal piano", free: "piano" },
    { label: "Elegant strings", words: ["strings", "elegant", "classical"], search: "elegant strings", free: "strings" },
  ],
  Education: [{ label: "Soft ambient", words: ["ambient", "soft", "calm"], search: "soft ambient", free: "ambient" }],
  "Brand story": [
    { label: "Gentle folk", words: ["folk", "gentle", "acoustic"], search: "gentle folk", free: "folk" },
    { label: "Cinematic strings", words: ["cinematic", "strings"], search: "cinematic emotional", free: "cinematic" },
  ],
  Community: [{ label: "Upbeat acoustic", words: ["upbeat", "happy", "acoustic"], search: "upbeat acoustic", free: "upbeat" }],
};

/** Moods that suit the post: calm and warm, never loud, to match the brand. */
export function moodsFor(slot: Pick<Slot, "pillar" | "format">): Mood[] {
  const own = MOODS[slot.pillar] ?? [];
  const extra = slot.format === "reel" ? MOODS.Lifestyle : MOODS.Product;
  return [...own, ...extra.filter((m) => !own.some((o) => o.label === m.label))].slice(0, 3);
}

export const pixabayUrl = (m: Mood) => `https://pixabay.com/music/search/${encodeURIComponent(m.search)}/`;

/** Ranks tracks in the music folder by how well their names fit the moods. */
export function rankTracks<T extends { name: string }>(tracks: T[], moods: Mood[]): { track: T; mood?: string }[] {
  return tracks
    .map((track) => {
      const n = track.name.toLowerCase();
      let best: { mood?: string; hits: number } = { hits: 0 };
      for (const m of moods) {
        const hits = m.words.filter((w) => n.includes(w)).length;
        if (hits > best.hits) best = { mood: m.label, hits };
      }
      return { track, mood: best.mood, hits: best.hits };
    })
    .sort((a, b) => b.hits - a.hits || a.track.name.localeCompare(b.track.name))
    .map(({ track, mood }) => ({ track, mood }));
}
