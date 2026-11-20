import { describe, expect, it } from "vitest";
import { creditFromName, creditOf, fileNameOf, lengthOf, pickTracks } from "./freeMusic";

const r = (o: Partial<Parameters<typeof pickTracks>[0][number]> = {}) => ({
  id: "1",
  title: "Lucky Acoustic",
  creator: "Jesse Keller",
  license: "by",
  license_version: "3.0",
  url: "https://prod-1.storage.jamendo.com/?trackid=1&format=mp32",
  foreign_landing_url: "https://www.jamendo.com/track/1",
  duration: 202000,
  tags: [{ name: "instrumental" }, { name: "happy" }],
  ...o,
});

describe("free music", () => {
  it("keeps instrumental CC0 and CC BY tracks of a usable length", () => {
    const got = pickTracks([
      r({ id: "sa", license: "by-sa" }),
      r({ id: "nc", license: "by-nc" }),
      r({ id: "short", duration: 9000 }),
      r({ id: "long", duration: 1173000 }),
      r({ id: "vocal", tags: [{ name: "vocal" }] }),
      r({ id: "plain", tags: [] }),
      r({ id: "cc0", license: "cc0", title: "Key &amp; Lock" }),
    ]);
    expect(got.map((t) => t.id)).toEqual(["cc0", "plain"]);
    expect(got[0].title).toBe("Key & Lock");
    expect(got[0].seconds).toBe(202);
  });

  it("writes the credit CC BY asks for and reads it back from the Drive file name", () => {
    const [t] = pickTracks([r()]);
    expect(creditOf(t)).toBe('Music: "Lucky Acoustic" by Jesse Keller (CC BY 3.0)');
    expect(creditOf({ ...t, license: "cc0" })).toBeUndefined();
    expect(fileNameOf(t)).toBe("Lucky Acoustic - Jesse Keller (CC BY 3.0).mp3");
    expect(creditFromName(fileNameOf(t))).toBe(creditOf(t));
    expect(creditFromName(fileNameOf({ ...t, license: "cc0" }))).toBeUndefined();
    expect(creditFromName("calm acoustic.mp3")).toBeUndefined();
    expect(lengthOf(202)).toBe("3:22");
  });
});
