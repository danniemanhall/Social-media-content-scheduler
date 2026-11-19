import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BROLL_MOVES, brollName, brollPlan, cameraAt, detailFocus, framesArgs, joinArgs, planSeconds, type BrollMove } from "./broll";

const W = 1080;
const H = 1920;
const MOVES = Object.keys(BROLL_MOVES) as BrollMove[];
const PHOTOS = [
  { width: 3024, height: 4032 },
  { width: 4032, height: 3024 },
  { width: 1080, height: 1350 },
  { width: 2000, height: 2000 },
];

/** Corners of the output frame, mapped back onto the photo. */
function corners(f: ReturnType<typeof cameraAt>) {
  return [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [-W / 2, H / 2],
    [W / 2, H / 2],
  ].map(([x, y]) => {
    const c = Math.cos(-f.roll);
    const s = Math.sin(-f.roll);
    return [f.cx + (x * c - y * s) / f.scale, f.cy + (x * s + y * c) / f.scale];
  });
}

describe("cameraAt", () => {
  it("never shows past the photo's edge, for every move, photo shape and moment", () => {
    for (const img of PHOTOS)
      for (const m of MOVES)
        for (let t = 0; t <= 3; t += 1 / 30) {
          for (const [x, y] of corners(cameraAt(m, t, 3, img, 7, { x: 0.9, y: 0.1 }))) {
            expect(x).toBeGreaterThanOrEqual(-0.01);
            expect(y).toBeGreaterThanOrEqual(-0.01);
            expect(x).toBeLessThanOrEqual(img.width + 0.01);
            expect(y).toBeLessThanOrEqual(img.height + 0.01);
          }
        }
  });

  it("moves smoothly: no jumps between frames, and already moving on the first frame", () => {
    for (const m of MOVES) {
      const img = PHOTOS[0];
      let prev = cameraAt(m, 0, 3, img, 3);
      const first = cameraAt(m, 1 / 30, 3, img, 3);
      // Output pixels moved between frames.
      const moved = (a: typeof prev, b: typeof prev) => Math.hypot(a.cx - b.cx, a.cy - b.cy) * b.scale + Math.abs(a.scale / b.scale - 1) * H;
      expect(moved(prev, first)).toBeGreaterThan(0.05);
      for (let f = 1; f <= 90; f++) {
        const cur = cameraAt(m, f / 30, 3, img, 3);
        expect(moved(prev, cur)).toBeLessThan(12);
        expect(Math.abs(cur.roll)).toBeLessThan((0.5 * Math.PI) / 180);
        prev = cur;
      }
    }
  });

  it("keeps close-ups sharp: never enlarges the photo much past its own pixels", () => {
    for (const img of PHOTOS.slice(0, 2)) expect(cameraAt("detail", 1, 2, img, 1).scale).toBeLessThan(1.15);
  });

  it("settles focus at the start of a close-up only", () => {
    expect(cameraAt("detail", 0, 2, PHOTOS[0], 1).blur).toBeGreaterThan(1);
    expect(cameraAt("detail", 0.5, 2, PHOTOS[0], 1).blur).toBe(0);
    expect(cameraAt("push", 0, 2, PHOTOS[0], 1).blur).toBe(0);
  });

  it("moves differently for different seeds", () => {
    const a = cameraAt("push", 1, 3, PHOTOS[0], 1);
    const b = cameraAt("push", 1, 3, PHOTOS[0], 2);
    expect(a.cx).not.toBeCloseTo(b.cx, 1);
  });
});

describe("detailFocus", () => {
  it("finds the textured part of an otherwise plain photo", () => {
    const w = 96;
    const h = 128;
    const gray = new Float32Array(w * h).fill(200);
    // Busy stripes in the lower right, like rope against a plain wall.
    for (let y = 80; y < 120; y++) for (let x = 55; x < 90; x++) gray[y * w + x] = (x + y) % 3 ? 40 : 230;
    const p = detailFocus(gray, w, h);
    expect(p.x).toBeGreaterThan(0.55);
    expect(p.y).toBeGreaterThan(0.6);
  });
});

describe("brollName", () => {
  it("names clips after the photo and the move", () => {
    expect(brollName("Sunday lunch: table.jpg", "pan")).toBe("Sunday lunch- table - slide across.mp4");
  });
});

describe("brollPlan", () => {
  it("slides across wide photos, never repeats a move back to back, and varies shot length", () => {
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
    expect(new Set(plan.map((p) => p.seconds)).size).toBeGreaterThan(2);
    expect(plan.filter((p) => p.closeUp > 0).length).toBe(3);
    expect(planSeconds(plan)).toBeGreaterThan(14);
    expect(planSeconds(plan)).toBeLessThan(20);
  });

  it("only tilts up tall photos", () => {
    for (const p of brollPlan(Array.from({ length: 8 }, () => ({ width: 2000, height: 2000 })))) expect(p.move).not.toBe("tilt");
  });
});

let hasFfmpeg = false;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  hasFfmpeg = true;
} catch {
  /* no native ffmpeg on this machine */
}

describe.runIf(hasFfmpeg)("frames to video with real ffmpeg", () => {
  it("encodes JPEG frames into 1080x1920 clips that join without re-encoding", () => {
    const dir = mkdtempSync(join(tmpdir(), "broll-"));
    const run = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd: dir });
    run(["-f", "lavfi", "-i", "testsrc2=s=1080x1920:d=1:r=30", "-q:v", "3", "bf-%05d.jpg"]);
    run(framesArgs("bf-%05d.jpg", "a.mp4"));
    run(framesArgs("bf-%05d.jpg", "b.mp4"));
    writeFileSync(join(dir, "list.txt"), "file 'a.mp4'\nfile 'b.mp4'");
    run(joinArgs("list.txt", "final.mp4"));
    const [w, h, frames] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", "final.mp4"], { cwd: dir })
      .toString()
      .trim()
      .split(",")
      .map(Number);
    expect([w, h]).toEqual([1080, 1920]);
    expect(frames).toBe(60);
  }, 60_000);
});
