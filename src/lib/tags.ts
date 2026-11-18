import type { Scene } from "./brandFit";
import type { Format, Slot } from "./types";

/**
 * What's actually in each photo or video, written by Claude after looking at
 * it (see claude-runs/tag-media.md). The app can't see pictures, so it makes
 * "contact sheets" of 16 thumbnails at a time, saves them to Drive, and a
 * Claude run looks at each sheet and writes these tags back. Suggestions then
 * match the tags against the post's idea, shot list and format.
 */
export interface MediaTags {
  /** The kind of shot. */
  scene: Scene;
  /** Where it is, in a few words: "kitchen counter", "dining table", "white studio", "workshop bench", "market stall". */
  setting: string;
  /** The main things in frame, plain words: "oval bowl", "lemons", "linen napkin", "cardboard box", "tissue paper". */
  subjects: string[];
  /** Roopip products in frame, by family name from the product sheet: "Placemats", "Oval Bowls", "Planters". */
  products: string[];
  people: boolean;
  /** Hands at work (making, packing, styling). */
  hands: boolean;
  /** Boxes, wrapping, labels, orders being packed or sent. */
  packaging: boolean;
  /** One plain sentence describing the picture, shown on suggestions. */
  text: string;
  /** When Claude tagged it. */
  at?: string;
}

export const TAGS_KEY = "mediaTags";
export const SHEETS_KEY = "tagSheets";

export interface TagSheet {
  /** Drive file id of the contact-sheet JPG. */
  fileId: string;
  name: string;
  at: string;
  /** Media ids in cell order: cell 1 is items[0], top-left, reading across. */
  items: string[];
  /** Set by the Claude run once every cell is tagged. */
  done?: boolean;
}

export const SHEET_COLS = 4;
export const SHEET_ROWS = 4;
export const SHEET_CELLS = SHEET_COLS * SHEET_ROWS;
export const SHEET_CELL_PX = 300;

/** Words from the idea that point to things a photo might show, and what to look for in the tags. */
const SYNONYMS: Record<string, string[]> = {
  pack: ["packaging", "box", "parcel", "packing", "tissue", "wrap", "order", "courier", "label", "tape"],
  packing: ["packaging", "box", "parcel", "tissue", "wrap", "order", "label", "tape"],
  packed: ["packaging", "box", "parcel", "tissue", "wrap", "order"],
  packaging: ["packaging", "box", "parcel", "tissue", "wrap"],
  order: ["packaging", "box", "parcel", "order"],
  orders: ["packaging", "box", "parcel", "order"],
  box: ["box", "packaging", "parcel"],
  boxes: ["box", "packaging", "parcel"],
  parcel: ["parcel", "box", "packaging"],
  shipping: ["packaging", "box", "parcel", "courier"],
  delivery: ["packaging", "box", "parcel", "courier"],
  sealed: ["tape", "box", "packaging"],
  gift: ["gift", "wrap", "ribbon", "tissue", "box"],
  wrapped: ["wrap", "gift", "tissue", "ribbon"],
  kitchen: ["kitchen", "counter", "fruit", "lemons", "bread"],
  dining: ["dining", "table", "placemat", "plate", "napkin", "cutlery"],
  table: ["table", "dining", "placemat", "runner", "plate"],
  living: ["living room", "sofa", "couch", "lounge", "coffee table", "basket"],
  lounge: ["living room", "sofa", "couch", "lounge"],
  bathroom: ["bathroom", "towel", "basin", "soap"],
  bedroom: ["bedroom", "bed", "linen"],
  plant: ["plant", "planter", "greenery", "leaves"],
  plants: ["plant", "planter", "greenery", "leaves"],
  hands: ["hands"],
  making: ["hands", "workshop", "sewing machine", "rope", "coil"],
  weaving: ["hands", "workshop", "sewing machine", "rope", "coil"],
  workshop: ["workshop", "sewing machine", "rope", "bench"],
  market: ["market", "stall", "people", "carrier bag"],
  customer: ["people", "home", "review"],
  team: ["people", "workshop"],
  christmas: ["christmas", "festive", "tree", "gift"],
  festive: ["christmas", "festive", "gift"],
  outdoor: ["outdoor", "garden", "patio", "beach"],
  beach: ["beach", "sand", "outdoor"],
  picnic: ["picnic", "outdoor", "blanket"],
  fruit: ["fruit", "lemons", "oranges", "apples"],
  bread: ["bread", "kitchen"],
  coffee: ["coffee", "mug", "cup"],
};

const STOP = new Set(
  "about after again also and are around back been before being but can come could each every from have here into just like look made make more most much need only other our over same see show some such than that the their them then there these they this those through time very want what when where which while with your post photo photos video shot shots one each slide today".split(" "),
);

/** The words a post's idea is looking for, with their synonyms. */
export function ideaTerms(slot: Pick<Slot, "title"> & Partial<Pick<Slot, "prompt" | "shots" | "product">>): string[] {
  const raw = [slot.title, slot.prompt ?? "", ...(slot.shots ?? []), slot.product ?? ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const out = new Set<string>();
  for (const w of raw) {
    out.add(w.replace(/(es|s)$/, ""));
    for (const s of SYNONYMS[w] ?? []) out.add(s);
  }
  return [...out].filter((w) => w.length > 2);
}

/** Does the idea want packaging, hands or people in shot? */
export function ideaWants(slot: Pick<Slot, "title"> & Partial<Pick<Slot, "prompt" | "shots">>) {
  const t = ` ${[slot.title, slot.prompt ?? "", ...(slot.shots ?? [])].join(" ").toLowerCase()} `;
  return {
    packaging: /\b(pack|packing|packed|packaging|orders?|parcels?|box(es)?|shipping|courier|delivery|wrapp(ed|ing))\b/.test(t),
    hands: /\b(hands?|making|maker|weav|coil|sew|stitch|knot|behind the scenes|bts|workshop|process)/.test(t),
    people: /\b(customer|team|people|family|guests?|founder|market|us|we|meet)\b/.test(t),
  };
}

/**
 * How well a tagged photo fits a post, roughly 0 to 100, and the reasons in
 * plain words. Matches what's in the picture against the idea's words, the
 * kind of shot and the things the idea needs (packaging, hands, people).
 */
export function tagMatch(
  tags: MediaTags,
  slot: Pick<Slot, "title" | "format"> & Partial<Pick<Slot, "prompt" | "shots" | "product">>,
  wantedScene: Scene | null,
  isVideo: boolean,
): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  const hay = ` ${[tags.setting, tags.text, ...tags.subjects, ...tags.products].join(" ").toLowerCase()} `;
  const terms = ideaTerms(slot);
  const hits = terms.filter((t) => hay.includes(` ${t}`));
  if (hits.length) {
    score += Math.min(45, hits.length * 12);
    why.push(hits.slice(0, 2).join(", "));
  }
  const wants = ideaWants(slot);
  if (wants.packaging) {
    if (tags.packaging) {
      score += 35;
      why.push("packaging");
    } else score -= 20;
  }
  if (wants.hands) {
    if (tags.hands) {
      score += 25;
      why.push("hands at work");
    } else score -= 8;
  }
  if (wants.people && tags.people) {
    score += 12;
    why.push("people");
  }
  if (wantedScene) {
    if (tags.scene === wantedScene) score += 20;
    else if (wantedScene === "lifestyle" && tags.scene === "product") score -= 30;
    else score -= 10;
  }
  if (slot.product) {
    const fam = slot.product.toLowerCase().replace(/s$/, "");
    if (tags.products.some((p) => p.toLowerCase().includes(fam))) {
      score += 15;
      why.push(slot.product.toLowerCase());
    }
  }
  const f: Format = slot.format;
  if ((f === "reel" || f === "story") && isVideo) score += 8;
  return { score, why };
}
