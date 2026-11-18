import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BROLL_MOVES, BROLL_SECONDS, brollArgs, brollName, type BrollMove } from "./broll";

describe("brollArgs", () => {
  it("never grades, relights or filters the photo", () => {
    for (const m of Object.keys(BROLL_MOVES) as BrollMove[]) {
      const vf = brollArgs("in.jpg", m, "out.mp4")[brollArgs("in.jpg", m, "out.mp4").indexOf("-vf") + 1];
      expect(vf).not.toMatch(/eq=|colorbalance|curves|lut|hue=|unsharp|drawtext|vignette/);
    }
  });

  it("names clips after the photo and the move", () => {
    expect(brollName("Sunday lunch: table.jpg", "pan")).toBe("Sunday lunch- table - pan across.mp4");
  });
});

let hasFfmpeg = false;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  hasFfmpeg = true;
} catch {
  /* no native ffmpeg on this machine */
}

describe.runIf(hasFfmpeg)("brollArgs with real ffmpeg", () => {
  it("makes a 1080x1920 clip of every move from a wide and a tall photo", () => {
    const dir = mkdtempSync(join(tmpdir(), "broll-"));
    const run = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd: dir });
    run(["-f", "lavfi", "-i", "testsrc2=s=1600x1067:d=1", "-frames:v", "1", "wide.jpg"]);
    run(["-f", "lavfi", "-i", "testsrc2=s=1080x1350:d=1", "-frames:v", "1", "tall.jpg"]);
    for (const photo of ["wide.jpg", "tall.jpg"]) {
      for (const m of Object.keys(BROLL_MOVES) as BrollMove[]) {
        const out = `${photo}-${m}.mp4`;
        run(brollArgs(photo, m, out));
        const [w, h, frames] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,nb_frames", "-of", "csv=p=0", out], { cwd: dir })
          .toString()
          .trim()
          .split(",")
          .map(Number);
        expect([w, h]).toEqual([1080, 1920]);
        expect(frames).toBe(BROLL_SECONDS * 30);
      }
    }
  }, 180_000);
});
