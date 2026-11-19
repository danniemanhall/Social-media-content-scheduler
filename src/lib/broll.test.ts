import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyseFraming, BROLL_MOVES, busyFromTags, brollName, brollPlan, cameraAt, detailFocus, framesArgs, joinArgs, planSeconds, type BrollMove, type Framing } from "./broll";

const W = 1080;
const H = 1920;
const MOVES = Object.keys(BROLL_MOVES) as BrollMove[];
const PHOTOS = [
  { width: 3024, height: 4032 },
  { width: 4032, height: 3024 },
  { width: 1080, height: 1350 },
  { width: 2000, height: 2000 },
];

const SINGLE: Framing = { focus: { x: 0.5, y: 0.55 }, subject: { x0: 0.35, y0: 0.35, x1: 0.65, y1: 0.75 }, busy: false };
const BUSY: Framing = { focus: { x: 0.9, y: 0.1 }, subject: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 }, busy: true };

describe("cameraAt", () => {
  it("never shows past the photo's edge, for every move, photo shape, framing and moment", () => {
    for (const img of PHOTOS)
      for (const m of MOVES)
        for (const fr of [SINGLE, BUSY])
          for (const dir of [1, -1] as const)
            for (let t = 0; t <= 3; t += 1 / 30) {
              const f = cameraAt(m, t, 3, img, fr, dir);
              expect(f.cx - W / 2 / f.scale).toBeGreaterThanOrEqual(-0.01);
              expect(f.cy - H / 2 / f.scale).toBeGreaterThanOrEqual(-0.01);
              expect(f.cx + W / 2 / f.scale).toBeLessThanOrEqual(img.width + 0.01);
              expect(f.cy + H / 2 / f.scale).toBeLessThanOrEqual(img.height + 0.01);
            }
  });

  it("glides: smooth, steady and with no shake", () => {
    for (const m of MOVES)
      for (const fr of [SINGLE, BUSY]) {
        const img = PHOTOS[0];
        const pos = Array.from({ length: 91 }, (_, f) => cameraAt(m, f / 30, 3, img, fr, 1));
        const out = (a: (typeof pos)[0], b: (typeof pos)[0]) => Math.hypot(a.cx - b.cx, a.cy - b.cy) * b.scale + Math.abs(a.scale / b.scale - 1) * H;
        for (let f = 1; f < pos.length; f++) expect(out(pos[f - 1], pos[f])).toBeLessThan(5);
        // No wobble: speed changes gently from frame to frame.
        for (let f = 2; f < pos.length; f++) expect(Math.abs(out(pos[f - 1], pos[f]) - out(pos[f - 2], pos[f - 1]))).toBeLessThan(0.3);
      }
  });

  it("slides left to right, then right to left, without stalling at an edge", () => {
    for (const img of PHOTOS)
      for (const fr of [SINGLE, BUSY]) {
        const a0 = cameraAt("pan", 0, 3, img, fr, 1);
        const a1 = cameraAt("pan", 3, 3, img, fr, 1);
        const b0 = cameraAt("pan", 0, 3, img, fr, -1);
        const b1 = cameraAt("pan", 3, 3, img, fr, -1);
        expect((a1.cx - a0.cx) * a1.scale).toBeGreaterThan(150);
        expect((b0.cx - b1.cx) * b1.scale).toBeGreaterThan(150);
        // Still moving near the end, not parked against the edge.
        const late = cameraAt("pan", 2.8, 3, img, fr, 1);
        expect(a1.cx - late.cx).toBeGreaterThan(0);
      }
  });

  it("films busy scenes close and a single product wide", () => {
    const img = PHOTOS[0];
    const close = cameraAt("pan", 1, 3, img, BUSY);
    const wide = cameraAt("pan", 1, 3, img, SINGLE);
    expect(close.scale).toBeGreaterThan(wide.scale * 1.15);
    // The whole single product stays in view.
    const v = { x0: wide.cx - W / 2 / wide.scale, x1: wide.cx + W / 2 / wide.scale, y0: wide.cy - H / 2 / wide.scale, y1: wide.cy + H / 2 / wide.scale };
    for (let t = 0; t <= 3; t += 0.5) {
      const f = cameraAt("pan", t, 3, img, SINGLE, 1);
      expect(f.cx - W / 2 / f.scale).toBeLessThanOrEqual(SINGLE.subject.x0 * img.width);
      expect(f.cx + W / 2 / f.scale).toBeGreaterThanOrEqual(SINGLE.subject.x1 * img.width);
    }
    expect(v.y0).toBeLessThanOrEqual(SINGLE.subject.y0 * img.height);
    expect(v.y1).toBeGreaterThanOrEqual(SINGLE.subject.y1 * img.height);
  });

  it("keeps close shots sharp: never enlarges the photo much past its own pixels", () => {
    for (const img of PHOTOS.slice(0, 2)) for (const m of MOVES) expect(cameraAt(m, 3, 3, img, BUSY).scale).toBeLessThan(1.15);
  });
});

describe("analyseFraming", () => {
  const w = 96;
  const h = 128;
  it("sees one product on a plain background as a single piece, and finds it", () => {
    const gray = new Float32Array(w * h).fill(200);
    for (let y = 50; y < 100; y++) for (let x = 30; x < 66; x++) gray[y * w + x] = (x + y) % 3 ? 60 : 220;
    const f = analyseFraming(gray, w, h);
    expect(f.busy).toBe(false);
    expect(f.subject.x0).toBeGreaterThan(0.25);
    expect(f.subject.x1).toBeLessThan(0.75);
    expect(f.subject.y0).toBeGreaterThan(0.33);
  });

  it("uses colour: one product filling the frame is a single piece, many colours are busy", () => {
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = ((x * 7 + y * 3) % 11) * 20;
    expect(analyseFraming(gray, w, h, undefined, 0.75).busy).toBe(false);
    expect(analyseFraming(gray, w, h, undefined, 0.25).busy).toBe(true);
  });

  it("sees detail all over as a busy scene", () => {
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = ((x * 7 + y * 3) % 11) * 20;
    expect(analyseFraming(gray, w, h).busy).toBe(true);
  });
});

describe("detailFocus", () => {
  it("finds the textured part of an otherwise plain photo", () => {
    const w = 96;
    const h = 128;
    const gray = new Float32Array(w * h).fill(200);
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

describe("busyFromTags", () => {
  const t = (products: string[], subjects: string[]) => ({ scene: "lifestyle" as const, setting: "", subjects, products, people: false, hands: false, packaging: false, text: "" });
  it("reads Claude's tags as busy, single or unsure", () => {
    expect(busyFromTags(t(["Planters"], ["planter", "plant"]))).toBe(false);
    expect(busyFromTags(t(["Bowls", "Placemats"], ["bowl", "placemat"]))).toBe(true);
    expect(busyFromTags(t(["Bowls"], ["bowl", "lemons", "napkin", "plate"]))).toBe(true);
    expect(busyFromTags(t(["Bowls"], ["bowl", "lemons", "napkin"]))).toBeUndefined();
    expect(busyFromTags(undefined)).toBeUndefined();
  });
});

describe("brollPlan", () => {
  it("alternates direction shot to shot and varies shot length", () => {
    const plan = brollPlan([1, 2, 3, 4, 5]);
    for (let i = 1; i < plan.length; i++) expect(plan[i].dir).toBe(-plan[i - 1].dir);
    expect(plan.every((p) => p.move === "pan")).toBe(true);
    expect(new Set(plan.map((p) => p.seconds)).size).toBeGreaterThan(2);
    expect(planSeconds(plan)).toBeGreaterThan(14);
    expect(planSeconds(plan)).toBeLessThan(18);
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
