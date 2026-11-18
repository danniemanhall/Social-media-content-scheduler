import { describe, expect, it } from "vitest";
import { analysePixels, brandFit, FIT_OK, FIT_WARN, gridClash, lastUsedMap, suggestMedia, type IndexedMedia, type Look } from "./brandFit";
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
    const got = suggestMedia({ ...slot, format: "reel", pillar: "Craftsmanship", product: undefined }, lib, looks, {}, "2026-12-01");
    expect(got[0].media.id).toBe("d");
  });

  it("finds the last date each file was used", () => {
    const s = (id: string, date: string, ids: string[]) => ({ id, date, media: ids.map((i) => ({ id: i })) }) as unknown as Slot;
    expect(lastUsedMap([s("1", "2026-11-01", ["a"]), s("2", "2026-11-09", ["a", "b"]), s("3", "2026-11-20", ["b"])], "3")).toEqual({ a: "2026-11-09", b: "2026-11-09" });
  });
});
