import { BRAND } from "./brand";
import type { Format, MediaRef, Slot } from "./types";

/**
 * Brand fit: checks a photo's colours and light against the Roopip palette and
 * photo direction (warm, natural, soft, neutral), and against the posts next
 * to it on the grid. Pure functions; the browser side (canvas) is in
 * mediaIndex.ts. Fonts and text overlays can't be read from pixels this way,
 * so Claude's scheduled runs look at those (see claude-runs/ask-claude.md).
 */

export interface Look {
  /** Main colours, most common first, as #rrggbb, with their share of the image (0-1). */
  colours: { hex: string; share: number }[];
  /** 0 = black, 1 = white. */
  brightness: number;
  /** Below 0 is cool (blue), above 0 is warm (amber). Roughly -0.3 to 0.3. */
  warmth: number;
  /** 0 = grey, 1 = neon. */
  saturation: number;
}

export interface Fit {
  /** 0-100. 70+ fits the brand well, 50-69 is borderline, under 50 clashes. */
  score: number;
  /** Plain-language reasons the score is lower, empty when it fits. */
  reasons: string[];
}

export const FIT_OK = 70;
export const FIT_WARN = 50;

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const labOf = (hex: string) => rgbToLab(...hexToRgb(hex));
const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The palette plus the in-between tones real Roopip photos are full of (linen,
 * pale wood, soft shadow). Without these, ordinary well-lit product photos
 * would score as off-brand.
 */
const BRAND_TONES: Lab[] = [
  ...BRAND.palette.map((p) => p.hex),
  "#FFFFFF", "#E9E4DA", "#D8CFC2", "#B9A58F", "#8C735E", "#5E4B3C", "#8A8F7A", "#4A4F3F", "#1F1A16",
].map(labOf);

function hueName(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return "grey";
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 335) return "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "turquoise";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/** Summarises raw RGBA pixels (from a small canvas) into a Look. */
export function analysePixels(data: Uint8ClampedArray | number[]): Look {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let n = 0;
  let sumL = 0;
  let sumWarm = 0;
  let sumSat = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    n++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sumL += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    sumWarm += (r - b) / 255;
    sumSat += max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bk.n++;
    bk.r += r;
    bk.g += g;
    bk.b += b;
    buckets.set(key, bk);
  }
  if (!n) return { colours: [], brightness: 0.5, warmth: 0, saturation: 0 };

  // Merge near-identical buckets into a handful of main colours.
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const merged: { lab: Lab; n: number; r: number; g: number; b: number }[] = [];
  for (const bk of sorted) {
    const lab = rgbToLab(bk.r / bk.n, bk.g / bk.n, bk.b / bk.n);
    const near = merged.find((m) => dist(m.lab, lab) < 14);
    if (near) {
      near.n += bk.n;
      near.r += bk.r;
      near.g += bk.g;
      near.b += bk.b;
    } else merged.push({ lab, ...bk });
  }
  const colours = merged
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((m) => ({ hex: rgbToHex(m.r / m.n, m.g / m.n, m.b / m.n), share: Math.round((m.n / n) * 100) / 100 }))
    .filter((c) => c.share >= 0.03);

  return {
    colours,
    brightness: Math.round((sumL / n) * 100) / 100,
    warmth: Math.round((sumWarm / n) * 100) / 100,
    saturation: Math.round((sumSat / n) * 100) / 100,
  };
}

/** How well a photo's colours and light match the Roopip look. */
export function brandFit(look: Look): Fit {
  if (!look.colours.length) return { score: 0, reasons: ["Couldn't read this image's colours."] };
  const reasons: string[] = [];

  let weighted = 0;
  let total = 0;
  const offBrand: { hex: string; share: number; d: number }[] = [];
  for (const c of look.colours) {
    const lab = labOf(c.hex);
    const d = Math.min(...BRAND_TONES.map((t) => dist(t, lab)));
    weighted += d * c.share;
    total += c.share;
    if (d > 28 && c.share >= 0.06) offBrand.push({ ...c, d });
  }
  const meanD = total ? weighted / total : 50;
  // 12 or closer is spot on; 45 and beyond is a different colour world.
  let score = 100 - Math.max(0, Math.min(100, ((meanD - 12) / 33) * 100)) * 0.6;

  if (offBrand.length) {
    const names = [...new Set(offBrand.map((c) => hueName(c.hex)))].slice(0, 2);
    const pct = Math.round(offBrand.reduce((s, c) => s + c.share, 0) * 100);
    reasons.push(`About ${pct}% of the image is ${names.join(" and ")}, which isn't in the Roopip palette.`);
  }
  if (look.saturation > 0.42) {
    score -= Math.min(25, (look.saturation - 0.42) * 120);
    reasons.push("Colours are very bright and saturated. Roopip's look is soft and natural.");
  }
  if (look.warmth < -0.02) {
    score -= Math.min(20, (-0.02 - look.warmth) * 250);
    reasons.push("The light is cool or blue. Roopip photos have warm, natural light.");
  }
  if (look.brightness < 0.22) {
    score -= 15;
    reasons.push("The image is very dark. Roopip photos are light and airy with soft shadows.");
  } else if (look.brightness > 0.93) {
    score -= 8;
    reasons.push("The image is nearly all white, so it may look washed out on the grid.");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/** Average look of a few images, for comparing a photo with its grid neighbours. */
export function averageLook(looks: Look[]): Look | null {
  if (!looks.length) return null;
  const avg = (f: (l: Look) => number) => looks.reduce((s, l) => s + f(l), 0) / looks.length;
  return {
    colours: looks.flatMap((l) => l.colours.slice(0, 2)).map((c) => ({ hex: c.hex, share: c.share / looks.length })),
    brightness: avg((l) => l.brightness),
    warmth: avg((l) => l.warmth),
    saturation: avg((l) => l.saturation),
  };
}

/** Why a photo would look out of step with the grid posts next to it, if it would. */
export function gridClash(look: Look, neighbours: Look[]): string[] {
  const near = averageLook(neighbours);
  if (!near) return [];
  const out: string[] = [];
  const db = look.brightness - near.brightness;
  if (Math.abs(db) > 0.22) out.push(`It's much ${db < 0 ? "darker" : "lighter"} than the grid posts around it.`);
  const dw = look.warmth - near.warmth;
  if (dw < -0.1) out.push("It's noticeably cooler in tone than the grid posts around it.");
  if (look.saturation - near.saturation > 0.2) out.push("Its colours are much stronger than the grid posts around it.");
  if (look.colours[0] && near.colours.length) {
    const main = labOf(look.colours[0].hex);
    const closest = Math.min(...near.colours.map((c) => dist(labOf(c.hex), main)));
    if (closest > 35) out.push(`Its main colour (${hueName(look.colours[0].hex)}) doesn't appear in the posts around it.`);
  }
  return out;
}

const WORDS: Record<string, string[]> = {
  Product: ["product", "flatlay", "flat lay", "packshot", "white", "studio"],
  Lifestyle: ["lifestyle", "home", "table", "styled", "interior", "kitchen", "lounge", "dining"],
  Craftsmanship: ["making", "process", "hands", "weaving", "workshop", "dye", "dyeing", "rope", "bts", "behind"],
  Education: ["care", "detail", "close", "texture", "size", "how"],
  "Brand story": ["knysna", "team", "milla", "studio", "story", "founder"],
  Community: ["customer", "review", "market", "event", "community", "gift"],
};

function words(s: string) {
  return s.toLowerCase().replace(/[_\-./]+/g, " ");
}

/** True when a file suits the slot's format at all (videos for reels, and so on). */
export function suitsFormat(format: Format, m: Pick<MediaRef, "mimeType" | "width" | "height">): boolean {
  const video = m.mimeType.startsWith("video/");
  if (format === "reel") return true; // photos can be used as reel shots
  if (format === "story") return true;
  return !video; // grid posts and carousels here are photos
}

export interface IndexedMedia extends MediaRef {
  /** Folder names from the media folder down to the file, for matching words. */
  path?: string;
}

export interface Suggestion {
  media: IndexedMedia;
  score: number;
  fit: Fit | null;
  why: string[];
}

/**
 * Ranks media for a slot: brand fit first, then how well the file and folder
 * names match the post's product and pillar, the right shape for the format,
 * and whether it was used recently.
 */
export function suggestMedia(
  slot: Pick<Slot, "id" | "format" | "pillar" | "product" | "title" | "media">,
  library: IndexedMedia[],
  looks: Record<string, Look | undefined>,
  lastUsed: Record<string, string | undefined>,
  today: string,
  limit = 8,
): Suggestion[] {
  const have = new Set(slot.media.map((m) => m.id));
  const productWords = slot.product ? words(slot.product).split(" ").map((w) => w.replace(/s$/, "")).filter((w) => w.length > 2) : [];
  const pillarWords = WORDS[slot.pillar] ?? [];
  const titleWords = words(slot.title).split(" ").filter((w) => w.length > 4);

  const out: Suggestion[] = [];
  for (const m of library) {
    if (have.has(m.id) || !suitsFormat(slot.format, m)) continue;
    const text = words(`${m.path ?? ""} ${m.name}`);
    const why: string[] = [];
    let score = 0;

    const look = looks[m.id];
    const fit = look ? brandFit(look) : null;
    score += fit ? fit.score * 0.5 : 30; // unknown look: middling
    if (fit && fit.score >= FIT_OK) why.push("on-brand colours");

    if (productWords.length && productWords.some((w) => text.includes(w))) {
      score += 25;
      why.push(slot.product!.toLowerCase());
    }
    if (pillarWords.some((w) => text.includes(w))) {
      score += 8;
      why.push(slot.pillar.toLowerCase());
    } else if (titleWords.some((w) => text.includes(w))) score += 6;

    const video = m.mimeType.startsWith("video/");
    if (slot.format === "reel" && video) {
      score += 10;
      why.push("video");
    }
    if (m.width && m.height) {
      const ratio = m.width / m.height;
      if ((slot.format === "reel" || slot.format === "story") && ratio < 0.8) score += 5;
      if ((slot.format === "post" || slot.format === "carousel") && ratio >= 0.7 && ratio <= 1.05) score += 5;
    }

    const used = lastUsed[m.id];
    if (used) {
      const days = Math.abs((Date.parse(today) - Date.parse(used)) / 86_400_000);
      if (days < 21) score -= 35 - days; // the same photo twice in three weeks looks repetitive
      else why.push("not used lately");
    } else why.push("never used");

    out.push({ media: m, score: Math.round(score), fit, why });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Last date each media file was used in a post other than this one. */
export function lastUsedMap(slots: Slot[], exceptId?: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) {
    if (s.id === exceptId) continue;
    for (const m of s.media) if (!map[m.id] || map[m.id] < s.date) map[m.id] = s.date;
  }
  return map;
}
