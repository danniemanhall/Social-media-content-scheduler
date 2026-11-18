import { describe, expect, it } from "vitest";
import { pickBrollPhotos, suggestMedia, type IndexedMedia } from "./brandFit";
import { ideaTerms, type MediaTags } from "./tags";
import type { Slot } from "./types";

const img = (id: string, path = "Lifestyle photos"): IndexedMedia => ({ id, source: "drive", name: `PXL_${id}.jpg`, mimeType: "image/jpeg", path, width: 1080, height: 1350 });
const tag = (t: Partial<MediaTags>): MediaTags => ({ scene: "lifestyle", setting: "", subjects: [], products: [], people: false, hands: false, packaging: false, text: "", ...t });

const lib = [img("pack"), img("table"), img("studio", "Product Photos/Bowls"), img("hands"), img("untagged")];
const tags: Record<string, MediaTags> = {
  pack: tag({ scene: "process", setting: "packing table", subjects: ["cardboard box", "tissue paper", "oval bowl"], hands: true, packaging: true, text: "Hands wrapping an oval bowl in tissue for a box." }),
  table: tag({ setting: "dining table", subjects: ["placemat", "plates", "napkin"], products: ["Placemats"], text: "Placemats on a set dining table." }),
  studio: tag({ scene: "product", setting: "white studio", subjects: ["oval bowl"], products: ["Oval Bowls"], text: "Oval bowl on white." }),
  hands: tag({ scene: "process", setting: "workshop bench", subjects: ["rope", "sewing machine"], hands: true, text: "Hands coiling rope at the sewing machine." }),
};
const slot = (title: string, prompt: string, shots: string[] = [], extra: Partial<Slot> = {}) =>
  ({ id: "s", format: "post", pillar: "Community", title, prompt, shots, media: [], ...extra }) as Slot;

describe("tag matching", () => {
  it("expands the idea's words to what a picture would show", () => {
    expect(ideaTerms({ title: "Orders being packed today" })).toEqual(expect.arrayContaining(["packaging", "box", "parcel"]));
  });

  it("puts the packaging photo first for a packing post", () => {
    const got = suggestMedia(slot("Packing day", "Orders being packed today.", ["Boxes being packed and sealed"]), lib, {}, {}, "2026-12-01", 5, tags);
    expect(got[0].media.id).toBe("pack");
    expect(got[0].why).toContain("packaging");
    expect(got[0].text).toMatch(/tissue/);
  });

  it("puts the set table first for a dining idea, and the studio shot last", () => {
    const got = suggestMedia(slot("5 ways to style rope decor", "Dining table with placemats, one slide each.", [], { pillar: "Lifestyle" }), lib, {}, {}, "2026-12-01", 5, tags);
    expect(got[0].media.id).toBe("table");
    expect(got.findIndex((g) => g.media.id === "studio")).toBeGreaterThan(got.findIndex((g) => g.media.id === "untagged"));
  });

  it("finds hands at work for a making-of idea", () => {
    const got = suggestMedia(slot("From rope to bowl", "Hands coiling rope in the workshop", [], { pillar: "Craftsmanship" }), lib, {}, {}, "2026-12-01", 5, tags);
    expect(got[0].media.id).toBe("hands");
  });
});

describe("pickBrollPhotos", () => {
  it("uses only real-setting photos, best fit first, never the studio packshot", () => {
    const got = pickBrollPhotos(slot("Sunday lunch", "A set dining table with placemats", [], { pillar: "Lifestyle" }), lib, {}, {}, "2026-12-01", tags);
    const ids = got.map((g) => g.media.id);
    expect(ids[0]).toBe("table");
    expect(ids).not.toContain("studio");
    expect(ids).not.toContain("hands"); // a making-of shot doesn't belong in a lifestyle idea's B-roll
    expect(ids).toContain("untagged"); // in the Lifestyle photos folder, so counted as lifestyle until Claude has seen it
  });

  it("allows making-of shots when the idea is about making", () => {
    const got = pickBrollPhotos(slot("From rope to bowl", "Hands coiling rope in the workshop", [], { pillar: "Craftsmanship" }), lib, {}, {}, "2026-12-01", tags);
    expect(got[0].media.id).toBe("hands");
    expect(got.map((g) => g.media.id)).not.toContain("studio");
  });
});
