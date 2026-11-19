import { addDays, weekStart } from "./dates";
import type { Format, Idea, Pillar } from "./types";

/**
 * The content "brain" from Carli's Drive doc
 * "Managing a Vibrant Color Palette for a 'Timeless & Elegant' Grid"
 * (Google Doc 1nJ-StqgJsEQgDU5SmN7AvHU1ucQdYoYyhSKkRtSuW_I).
 *
 * Suggestions read this so ideas follow the doc's weekly rhythm, grid rules
 * and sales-channel rules. Events and sales live in events.ts.
 */
export const PLAYBOOK_DOC = {
  id: "1nJ-StqgJsEQgDU5SmN7AvHU1ucQdYoYyhSKkRtSuW_I",
  title: "Managing a Vibrant Color Palette for a \"Timeless & Elegant\" Grid",
};

/** Styling and grid rules, short enough to show on a post. */
export const GRID_RULES: { title: string; rule: string }[] = [
  { title: "Neutral anchor (60-30-10)", rule: "Shoot every colour against calm, textural, neutral backdrops: linen, warm wood, white or beige walls, concrete, soft natural light." },
  { title: "Colour blocks", rule: "Group colours in batches (Navy & Natural one week, Green & Cream another) so rows on the profile feel harmonious." },
  { title: "Monochrome styling", rule: "Style a piece with props in its own colour family: green with wood and greenery, navy with crisp whites and deep blues." },
  { title: "Same warm light", rule: "Keep the same warm, soft, natural lighting on every photo. It is the glue that makes the grid feel cohesive." },
  { title: "Checkerboard", rule: "Put a light, airy neutral shot between two bolder colour shots, so the profile has breathing space." },
  { title: "Close-up, then wide", rule: "Alternate close-up texture shots with wide lifestyle shots, and styled lifestyle with process or maker shots." },
  { title: "Signature table", rule: "Shoot 40 to 50% of product shots on one signature surface (oak table or travertine slab), varying the framing." },
  { title: "Let it breathe", rule: "Leave negative space around the product. Photography does 80% of the work; skip busy text overlays." },
  { title: "Quiet captions", rule: "Warm, thoughtful storytelling. No shouting, no stacks of exclamation marks, no \"BUY NOW\"." },
];

/** Where to send people, by what they want (doc, Part 2: contextual linking). */
export type Channel = "amazon" | "takealot" | "yaga" | "website" | "shop";

export const CHANNEL_LABEL: Record<Channel, string> = {
  amazon: "Amazon.co.za",
  takealot: "Takealot",
  yaga: "Yaga",
  website: "our website",
  shop: "our Knysna shop at The Art On Queen",
};

export const CHANNEL_RULES = {
  convenience: {
    channels: ["amazon", "takealot"] as Channel[],
    when: "Gifting, bulk orders, fast delivery, last-minute",
    cta: "Find it conveniently stocked on Amazon.co.za and Takealot, link in bio.",
  },
  boutique: {
    channels: ["website", "yaga"] as Channel[],
    when: "Unique colourways, custom pieces, supporting local",
    cta: "Explore the full collection directly via our shop link in bio.",
  },
  local: {
    channels: ["shop"] as Channel[],
    when: "Locals, market days, shop sales",
    cta: "Pop in to see us at The Art On Queen, 10 Queen Street, Knysna.",
  },
};

/** Default call to action for a list of channels, matching the doc's rules. */
export function channelCta(channels: Channel[] | undefined): string {
  if (!channels?.length) return CHANNEL_RULES.boutique.cta;
  const names = channels.map((c) => CHANNEL_LABEL[c]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  if (channels.every((c) => c === "shop")) return CHANNEL_RULES.local.cta;
  return `Find it on ${list}, link in bio.`;
}

/** The four-week rhythm from the doc. Week 5 of a month repeats week 3 (styling). */
export interface WeekTheme {
  n: 1 | 2 | 3 | 4;
  name: string;
  focus: string;
  pillars: Pillar[];
  grid: string;
  stories: string[];
  highlight: string;
}

export const WEEK_THEMES: WeekTheme[] = [
  {
    n: 1,
    name: "Brand foundation & trust",
    focus: "The human element: the maker, the hands, the workshop at The Art On Queen.",
    pillars: ["Brand story", "Craftsmanship", "Community"],
    grid: "Maker's introduction or workshop reveal: your face, hands working the rope, wide shots of the workshop.",
    stories: [
      "Morning greeting from the workshop: fresh light on a stack of neutral rope.",
      "3-second clip of coiling or sewing, with a sticker: \"Which colour combo is your favourite?\"",
      "The storefront at 10 Queen Street, Knysna, with a \"Tap for directions\" sticker.",
    ],
    highlight: "Our Story / Workshop",
  },
  {
    n: 2,
    name: "Craftsmanship & quality",
    focus: "Why choose Roopip: how it's made, material transparency, durability.",
    pillars: ["Craftsmanship", "Education", "Product"],
    grid: "Aesthetic process reel (ASMR): close-up cotton rope texture, clean minimal background.",
    stories: [
      "Text card: \"Why cotton rope?\" (washable, durable, made to last).",
      "Behind the scenes: prepping an order to ship.",
      "Poll: \"Classic Neutral or a pop of Navy or Green?\"",
    ],
    highlight: "Shop",
  },
  {
    n: 3,
    name: "Aspirational styling",
    focus: "Timeless elegance in the home: calm dining and living spaces.",
    pillars: ["Lifestyle", "Product", "Education"],
    grid: "Styled lifestyle carousel: trivets, placemats or baskets in a calm space with wood, linen and greenery.",
    stories: [
      "\"Get the look\" styling tip, e.g. a plant inside a rope basket.",
      "Repost the grid image with a link sticker to the shop.",
      "Behind the scenes of setting up a shoot or a tablescape.",
    ],
    highlight: "Styling Inspo",
  },
  {
    n: 4,
    name: "Social proof & community",
    focus: "Customer spotlights, reviews, local community.",
    pillars: ["Community", "Lifestyle", "Brand story"],
    grid: "Customer home snap or designed review quote, framed cleanly.",
    stories: [
      "2 to 3 lovely reviews or thank-you DMs.",
      "Q&A sticker: \"Ask us anything about custom colours or stockists.\"",
      "Weekend reminder: come visit the shop in Knysna.",
    ],
    highlight: "Customer Reviews",
  },
];

/** Which of the four themes a week falls in: its Monday's week of the month. */
export function weekTheme(date: string): WeekTheme {
  const monday = weekStart(date);
  // Count by the Thursday so a week belongs to the month most of its days are in.
  const thursday = addDays(monday, 3);
  const nth = Math.ceil(Number(thursday.slice(8, 10)) / 7);
  return WEEK_THEMES[(nth >= 5 ? 3 : nth) - 1];
}

/** Engagement drivers from the doc, used to vary story suggestions. */
export const ENGAGEMENT = [
  "Polls and this-or-that on colour combinations",
  "Emoji slider on a workshop clip",
  "\"DM us BASKET for the details\" instead of a link",
  "Saveable styling tips over plain product shots",
  "The relatable home: tidy toys in 30 seconds with a basket",
  "Local maker collaboration giveaway (ceramicist, candle maker, linen designer)",
];

const DOC = "Find the full collection via the link in our bio.";

function d(
  id: string,
  format: Format,
  pillar: Pillar,
  title: string,
  prompt: string,
  shots: string[],
  caption: string,
  hashtags: string[],
  cta = DOC,
  months?: number[],
): Idea {
  return { id: `doc-${id}`, format, pillar, title, prompt, shots, caption, hashtags, cta, months };
}

/** Ideas written straight from the doc. They join the idea bank. */
export const DOC_IDEAS: Idea[] = [
  // Week 1: foundation and trust
  d("maker-intro", "carousel", "Brand story", "Welcome to our creative home",
    "Maker's introduction and workshop reveal at The Art On Queen in Knysna.",
    ["Portrait of the maker in the workshop", "Hands working the rope", "Wide shot of the tidy workshop", "Shelves of finished pieces", "Shopfront at 10 Queen Street"],
    "Welcome to our creative home. This is where every Roopip piece is made by hand, one length of rope at a time. Pop in and say hello when you're in Knysna.",
    ["#knysna", "#handmade", "#meetthemaker"], CHANNEL_RULES.local.cta),
  d("morning-workshop", "story", "Brand story", "Good morning from the workshop",
    "Morning greeting: fresh light falling on a stack of neutral rope.",
    ["Morning light on stacked rope", "Kettle or coffee on the workbench"],
    "Good morning from the workshop.", [], "Tap to follow along this week."),
  d("colour-combo-poll", "story", "Community", "Which colour combo is your favourite?",
    "A 3-second clip of coiling or sewing with a question sticker about favourite colour combinations.",
    ["Coiling rope, 3 seconds", "Two colourways side by side"],
    "Which colour combo is your favourite?", [], "Vote with the sticker."),
  d("tap-for-directions", "story", "Community", "Find us on Queen Street",
    "The storefront at 10 Queen Street, Knysna, with a \"Tap for directions\" location sticker.",
    ["Shopfront in good light", "Inside the door, looking in"],
    "Find us at The Art On Queen, 10 Queen Street, Knysna.", [], CHANNEL_RULES.local.cta),
  // Week 2: craftsmanship
  d("asmr-cotton", "reel", "Craftsmanship", "Every piece, 100% handmade in Knysna",
    "Aesthetic ASMR process reel: close-up cotton rope being handled, showing thick tactile texture. Clean minimal background.",
    ["Extreme close-up of rope fibres", "Hands pulling rope taut", "Machine stitch in slow motion", "Finished piece turned in the hands"],
    "Did you know every single Roopip piece is handmade right here in Knysna? Cotton rope is durable and easy to clean, made to be used every day.",
    ["#asmr", "#processvideo", "#handmadeinsouthafrica"]),
  d("why-cotton", "story", "Education", "Why cotton rope?",
    "Text card on why cotton rope: washable, durable, made to last. Brand fonts on warm ivory.",
    ["Text card on warm ivory", "Close-up texture behind the text"],
    "Why cotton rope? Soft, washable and made to last.", [], "Tap for care tips."),
  d("packing-order", "story", "Brand story", "Packing an order",
    "Behind the scenes: prepping an order to ship out.",
    ["Wrapping a piece in tissue", "Thank-you card going in", "Sealed parcel"],
    "Off to a new home today.", [], "Thank you for supporting handmade."),
  d("neutral-or-pop", "story", "Community", "Classic Neutral or a pop of colour?",
    "Poll sticker: Classic Neutral vs a pop of Navy or Green.",
    ["Neutral piece", "Navy or green piece, same surface and light"],
    "Classic Neutral or a pop of Navy or Green?", [], "Vote with the poll."),
  // Week 3: aspirational styling
  d("effortless-elegance", "carousel", "Lifestyle", "Effortless elegance for everyday living",
    "Styled lifestyle carousel: trivets, placemats or baskets in a calm dining or living space with wood, linen and greenery.",
    ["Wide shot of the styled table", "Close-up of placemat texture", "A hand placing a dish on a trivet", "Corner with a basket and plant"],
    "Effortless elegance for everyday living. A few considered pieces turn a home-cooked meal into a moment.",
    ["#tablestyling", "#calmhome", "#interiorinspo"]),
  d("get-the-look", "story", "Education", "Get the look: a plant in a rope basket",
    "Styling tip of the day, e.g. how to style a plant inside a rope basket.",
    ["Plant in plastic pot", "Placed in the basket", "Final styled corner"],
    "Get the look: three steps to a calm green corner.", [], "Save this for later."),
  d("tabletop-bts", "story", "Lifestyle", "Setting up the tablescape",
    "Behind the scenes of setting up a shoot or arranging a tablescape.",
    ["Bare signature table", "Pieces being placed", "Final frame"],
    "Setting the table for this week's shoot.", [], "Which setting should we shoot next?"),
  d("signature-table", "post", "Product", "Same table, new story",
    "Signature table shot: one surface, a new framing. Folded trivets with a linen napkin and a ceramic mug.",
    ["Medium shot of stacked trivets on the signature table", "Linen napkin and mug as props", "Soft window shadow across the rope"],
    "Quiet moments around the table. Crafted by hand to bring natural warmth to your everyday routines.",
    ["#tablestyling", "#slowliving"]),
  // Week 4: social proof
  d("customer-home", "post", "Community", "Organised spaces, happy homes",
    "Customer spotlight: a customer's photo of a basket used for toy storage or home organisation, framed cleanly.",
    ["Customer's photo (with permission)", "Crop to 4:5 with breathing space"],
    "Organised spaces, happy homes. Here is how one of you styled a Roopip basket.",
    ["#customerlove", "#homeorganisation"]),
  d("reviews-roundup", "story", "Community", "Kind words this week",
    "Share 2 to 3 text reviews or thank-you DMs from customers.",
    ["Screenshot of a review on a warm ivory card", "Second review card"],
    "Kind words that made our week.", [], "Add yours to our Customer Reviews highlight."),
  d("ask-us-anything", "story", "Community", "Ask us anything",
    "Q&A sticker about custom colours or local stockists.",
    ["Maker holding a rope sample", "Question sticker"],
    "Ask us anything about custom colours or where to find us.", [], "Drop your question in the sticker."),
  d("weekend-visit", "story", "Community", "See you this weekend",
    "Weekend reminder welcoming visitors to the shop in Knysna.",
    ["Shop interior in soft light", "Open sign or door"],
    "Visiting Knysna this weekend? Come say hello.", [], CHANNEL_RULES.local.cta),
  // Engagement drivers
  d("dm-basket", "story", "Product", "DM us BASKET",
    "A newly styled basket with a fiddle-leaf fig. Ask people to DM \"BASKET\" for dimensions and where to buy.",
    ["Styled basket with a plant", "Close-up of the weave"],
    "Want the exact size and where to find it? DM us BASKET.", [], "DM us BASKET."),
  d("toys-30-seconds", "reel", "Lifestyle", "Toys tidied in 30 seconds",
    "The relatable home: a rope storage basket as a parent's best-kept secret for tidying toys in 30 seconds.",
    ["Toys on the floor", "Sweeping them into the basket, sped up", "Calm tidy room, wide"],
    "A parent's best-kept secret: a beautiful basket and 30 seconds.",
    ["#homeorganisation", "#momlife", "#tidyhome"], CHANNEL_RULES.convenience.cta),
  d("coffee-table-tray", "carousel", "Education", "How to style a coffee table",
    "Saveable styling tip: a coffee table styled with a rope trivet, a candle and a book.",
    ["Bare coffee table", "Trivet placed", "Candle and book added", "Final wide shot"],
    "Three pieces, one calm coffee table. Save this for your next reset.",
    ["#stylingtips", "#coffeetablestyling"]),
  d("maker-collab", "post", "Community", "A curated home giveaway",
    "Local maker collaboration giveaway with a ceramicist, candle maker or linen designer. Follow both accounts, like, tag two friends.",
    ["Flat lay of both brands' pieces together", "Signature table, soft light"],
    "Two local makers, one curated home. To enter: follow both of us, like this post and tag two friends who love beautiful spaces.",
    ["#giveaway", "#supportlocal", "#knysna"], "Enter below."),
];
