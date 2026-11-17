import { describe, expect, it } from "vitest";
import { checkMedia } from "./media";

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
