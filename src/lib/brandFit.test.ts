import { describe, expect, it } from "vitest";
import { analysePixels, brandFit, FIT_OK, FIT_WARN, gridClash, lastUsedMap, sceneForMedia, sceneForSlot, suggestMedia, type IndexedMedia, type Look } from "./brandFit";
import type { Slot } from "./types";

/** Builds RGBA pixels from [colour, share] pairs, with a little noise like a real photo. */
function pixels(parts: [[number, number, number], number][], total = 4096) {
  const out: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 16;
  for (const [[r, g, b], share] of parts) {
    for (let i = 0; i < Math.round(total * share); i++) out.push(r + rnd(), g + rnd(), b + rnd(), 255);
  }
  return out.map((v, i) => (i % 4 === 3 ? v : Math.max(0, Math.min(255, Math.round(v)))));
}

const roopipPhoto = analysePixels(pixels([[[243, 238, 228], 0.45], [[214, 196, 172], 0.3], [[161, 122, 94], 0.15], [[70, 58, 48], 0.1]]));
const neonPhoto = analysePixels(pixels([[[20, 90, 240], 0.5], [[30, 220, 60], 0.3], [[250, 250, 250], 0.2]]));
const coolGrey = analysePixels(pixels([[[150, 165, 190], 0.7], [[60, 70, 90], 0.3]]));
const darkPhoto = analysePixels(pixels([[[30, 25, 22], 0.85], [[90, 70, 55], 0.15]]));

describe("brand fit", () => {
  it("passes a warm, neutral, rope-and-linen photo", () => {
    const fit = brandFit(roopipPhoto);
    expect(fit.score).toBeGreaterThanOrEqual(FIT_OK);
    expect(fit.reasons).toEqual([]);
  });

  it("flags bright off-palette colours and names them", () => {
    const fit = brandFit(neonPhoto);
    expect(fit.score).toBeLessThan(FIT_WARN);
    expect(fit.reasons.join(" ")).toMatch(/blue/);
    expect(fit.reasons.join(" ")).toMatch(/saturated/);
  });

  it("flags cool, blue light", () => {
    const fit = brandFit(coolGrey);
    expect(fit.score).toBeLessThan(FIT_OK);
    expect(fit.reasons.join(" ")).toMatch(/cool/);
  });

  it("accepts Roopip's own muted product colours on a white studio background, with a gentle note", () => {
    const packshot = analysePixels(pixels([[[252, 251, 250], 0.62], [[86, 89, 83], 0.3], [[219, 209, 198], 0.08]]));
    const fit = brandFit(packshot);
    expect(fit.score).toBeGreaterThanOrEqual(FIT_OK);
    expect(fit.reasons.join(" ")).toMatch(/white studio background/);
    const navy = analysePixels(pixels([[[118, 121, 130], 0.6], [[253, 253, 253], 0.4]]));
    expect(brandFit(navy).reasons.join(" ")).not.toMatch(/palette|cool/);
  });

  it("flags very dark images", () => {
    expect(brandFit(darkPhoto).reasons.join(" ")).toMatch(/dark/);
  });

  it("warns when a photo is out of step with its grid neighbours", () => {
    expect(gridClash(roopipPhoto, [roopipPhoto, roopipPhoto])).toEqual([]);
    expect(gridClash(darkPhoto, [roopipPhoto, roopipPhoto]).join(" ")).toMatch(/darker/);
    expect(gridClash(neonPhoto, [roopipPhoto]).length).toBeGreaterThan(0);
  });
});

describe("media suggestions", () => {
  const lib: IndexedMedia[] = [
    { id: "a", source: "drive", name: "placemat-linen-table.jpg", mimeType: "image/jpeg", path: "Product Photos/Placemats", width: 1080, height: 1350 },
    { id: "b", source: "drive", name: "IMG_2001.jpg", mimeType: "image/jpeg", path: "Product Photos/Baskets", width: 1080, height: 1350 },
    { id: "c", source: "drive", name: "placemat-neon.jpg", mimeType: "image/jpeg", path: "Product Photos/Placemats", width: 1080, height: 1350 },
    { id: "d", source: "drive", name: "weaving.mp4", mimeType: "video/mp4", path: "Brand Assets/Process" },
  ];
  const looks: Record<string, Look> = { a: roopipPhoto, b: roopipPhoto, c: neonPhoto, d: roopipPhoto };
  const slot: Pick<Slot, "id" | "format" | "pillar" | "product" | "title" | "media"> = {
    id: "s1", format: "post", pillar: "Product", product: "Placemats", title: "Set the table", media: [],
  };

  it("puts on-brand matches for the product first and skips videos for grid posts", () => {
    const got = suggestMedia(slot, lib, looks, {}, "2026-12-01");
    expect(got[0].media.id).toBe("a");
    expect(got.map((s) => s.media.id)).not.toContain("d");
    expect(got.findIndex((s) => s.media.id === "c")).toBeGreaterThan(got.findIndex((s) => s.media.id === "b"));
  });

  it("prefers media that hasn't been used recently", () => {
    const got = suggestMedia(slot, lib, looks, { a: "2026-11-28" }, "2026-12-01");
    expect(got[0].media.id).not.toBe("a");
  });

  it("leaves out media already on the post", () => {
    const got = suggestMedia({ ...slot, media: [lib[0]] }, lib, looks, {}, "2026-12-01");
    expect(got.map((s) => s.media.id)).not.toContain("a");
  });

  it("offers videos first for reels", () => {
    const got = suggestMedia({ ...slot, format: "reel", pillar: "Craftsmanship", product: undefined, title: "From rope to bowl", prompt: "Hands coiling rope in the workshop" }, lib, looks, {}, "2026-12-01");
    expect(got[0].media.id).toBe("d");
  });

  it("gives a lifestyle idea styled photos, not studio packshots", () => {
    const studio: Look = { colours: [{ hex: "#fbfbfb", share: 0.7 }, { hex: "#c9b49a", share: 0.3 }], brightness: 0.9, warmth: 0.02, saturation: 0.08 };
    const lifeLib: IndexedMedia[] = [
      { id: "pack", source: "drive", name: "placemat-sand.jpg", mimeType: "image/jpeg", path: "Product Photos/Placemats", width: 1080, height: 1350 },
      { id: "life", source: "drive", name: "IMG_3302.jpg", mimeType: "image/jpeg", path: "Shoots/Placemats", width: 1080, height: 1350 },
      { id: "named", source: "drive", name: "sunday-lunch-table.jpg", mimeType: "image/jpeg", path: "Shoots", width: 1080, height: 1350 },
    ];
    const lifeLooks: Record<string, Look> = { pack: studio, life: roopipPhoto, named: roopipPhoto };
    const idea = { ...slot, pillar: "Product" as const, title: "Placemats at Sunday lunch", prompt: "Styled table with guests, placemats in use at a long lunch." };
    expect(sceneForSlot(idea)).toBe("lifestyle");
    const got = suggestMedia(idea, lifeLib, lifeLooks, {}, "2026-12-01");
    expect(got.at(-1)!.media.id).toBe("pack");
    expect(got.slice(0, 2).map((g) => g.media.id).sort()).toEqual(["life", "named"]);
    expect(got[0].why).toContain("lifestyle shot");
    expect(got.find((g) => g.media.id === "named")!.why).toContain('"sunday"');
  });

  it("tells a studio packshot from a photo taken in a room by its edges", () => {
    // 64x64: a navy planter in the middle of a white backdrop, and the same planter on a wooden table.
    const scene = (bg: [number, number, number]) => {
      const px: number[] = [];
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const inside = x > 14 && x < 50 && y > 10 && y < 56;
        const [r, g, b] = inside ? [40, 50, 90] : bg;
        px.push(r, g, b, 255);
      }
      return analysePixels(px);
    };
    const studio = scene([248, 248, 246]);
    const room = scene([150, 118, 88]);
    expect(studio.edgeWhite).toBeGreaterThan(0.9);
    expect(room.edgeWhite).toBe(0);
    const m = { name: "Navy XS Planter.jpg", path: "Media" };
    expect(sceneForMedia(m, studio)).toBe("product");
    expect(sceneForMedia(m, room)).toBe("lifestyle");
    expect(sceneForMedia({ name: "x.jpg", path: "Roopip/Product Photos" }, room)).toBe("product");
    expect(sceneForMedia(m, { ...room, edgeWhite: undefined })).toBeNull();
  });

  it("reads the kind of shot from the idea before the pillar", () => {
    expect(sceneForSlot({ pillar: "Lifestyle", title: "Our range", prompt: "Flat lay of every colourway on white background" })).toBe("product");
    expect(sceneForSlot({ pillar: "Craftsmanship", title: "Behind the bowl" })).toBe("process");
    expect(sceneForSlot({ pillar: "Community", title: "Thank you" })).toBeNull();
  });

  it("finds the last date each file was used", () => {
    const s = (id: string, date: string, ids: string[]) => ({ id, date, media: ids.map((i) => ({ id: i })) }) as unknown as Slot;
    expect(lastUsedMap([s("1", "2026-11-01", ["a"]), s("2", "2026-11-09", ["a", "b"]), s("3", "2026-11-20", ["b"])], "3")).toEqual({ a: "2026-11-09", b: "2026-11-09" });
  });
});
