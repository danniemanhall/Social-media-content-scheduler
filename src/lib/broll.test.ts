import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BROLL_MOVES, BROLL_SECONDS, BROLL_VIDEO_SHOT, brollArgs, brollName, brollPlan, joinArgs, type BrollMove } from "./broll";

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

describe("brollPlan", () => {
  it("pans wide photos and never repeats a move back to back", () => {
    const plan = brollPlan([
      { width: 1600, height: 1067 },
      { width: 1600, height: 1067 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1350 },
    ]);
    expect(plan[0].move).toBe("pan");
    expect(plan[1].move).not.toBe("pan");
    for (let i = 1; i < plan.length; i++) expect(plan[i].move).not.toBe(plan[i - 1].move);
  });
});

describe.runIf(hasFfmpeg)("B-roll video with real ffmpeg", () => {
  it("films each photo and joins them into one 1080x1920 video", () => {
    const dir = mkdtempSync(join(tmpdir(), "brollv-"));
    const run = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd: dir });
    run(["-f", "lavfi", "-i", "testsrc2=s=1600x1067:d=1", "-frames:v", "1", "a.jpg"]);
    run(["-f", "lavfi", "-i", "testsrc2=s=1080x1350:d=1", "-frames:v", "1", "b.jpg"]);
    run(["-f", "lavfi", "-i", "testsrc2=s=1200x1200:d=1", "-frames:v", "1", "c.jpg"]);
    const plan = brollPlan([
      { name: "a.jpg", width: 1600, height: 1067 },
      { name: "b.jpg", width: 1080, height: 1350 },
      { name: "c.jpg", width: 1200, height: 1200 },
    ]);
    plan.forEach((p, i) => run(brollArgs(p.photo.name, p.move, `s${i}.mp4`, BROLL_VIDEO_SHOT)));
    writeFileSync(join(dir, "list.txt"), plan.map((_, i) => `file 's${i}.mp4'`).join("\n"));
    run(joinArgs("list.txt", "final.mp4"));
    const [w, h, frames] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", "final.mp4"], { cwd: dir })
      .toString()
      .trim()
      .split(",")
      .map(Number);
    expect([w, h]).toEqual([1080, 1920]);
    expect(frames).toBe(Math.round(BROLL_VIDEO_SHOT * 30) * 3);
  }, 180_000);
});
