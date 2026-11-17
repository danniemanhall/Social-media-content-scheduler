import { describe, expect, it } from "vitest";
import { checkMedia } from "./media";
import { cropBox } from "./outbox";

describe("checkMedia", () => {
  it("accepts 9:16 for reels and stories", () => {
    expect(checkMedia("reel", 1080, 1920).ok).toBe(true);
    expect(checkMedia("story", 720, 1280).ok).toBe(true);
  });
  it("flags landscape video for a reel", () => {
    expect(checkMedia("reel", 1920, 1080).ok).toBe(false);
  });
  it("flags long story clips", () => {
    expect(checkMedia("story", 1080, 1920, 75).ok).toBe(false);
  });
  it("accepts 4:5 and square for grid posts, flags landscape", () => {
    expect(checkMedia("post", 1080, 1350).ok).toBe(true);
    expect(checkMedia("carousel", 1080, 1080).ok).toBe(true);
    expect(checkMedia("post", 1600, 900).ok).toBe(false);
  });
});

describe("cropBox", () => {
  it("keeps photos Instagram accepts, crops tall ones to 4:5 and stories to 9:16", () => {
    expect(cropBox(1080, 1350, false)).toEqual({ x: 0, y: 0, w: 1080, h: 1350 });
    expect(cropBox(1080, 1920, false)).toEqual({ x: 0, y: 285, w: 1080, h: 1350 });
    expect(cropBox(4000, 1000, false)).toEqual({ x: 1045, y: 0, w: 1910, h: 1000 });
    expect(cropBox(1080, 1080, true)).toEqual({ x: 236, y: 0, w: 608, h: 1080 });
  });
});
