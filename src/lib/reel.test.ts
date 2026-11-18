import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoStoryboard, buildJob, cleanStoryboard, totalSeconds, wrapText, END_CARD_SECONDS } from "./reel";
import type { MediaRef } from "./types";

const vid = (id: string, durationSec = 8): MediaRef => ({ id, source: "local", name: `${id}.mp4`, mimeType: "video/mp4", durationSec });
const img = (id: string): MediaRef => ({ id, source: "local", name: `${id}.jpg`, mimeType: "image/jpeg" });

describe("autoStoryboard", () => {
  it("uses every clip and photo, lands near 18 seconds and puts the title on the first shot", () => {
    const sb = autoStoryboard([vid("a"), vid("b"), img("c"), vid("d")], "From rope to bowl");
    expect(sb.shots.map((s) => s.mediaId)).toEqual(["a", "b", "c", "d"]);
    expect(sb.shots[0].text).toBe("From rope to bowl");
    const body = totalSeconds(sb) - END_CARD_SECONDS;
    expect(body).toBeGreaterThanOrEqual(12);
    expect(body).toBeLessThanOrEqual(22);
  });

  it("adds one slow-motion moment and never reads past the end of a clip", () => {
    const sb = autoStoryboard([vid("a", 3), vid("b", 4), vid("c", 30)], "x");
    expect(sb.shots.filter((s) => s.speed < 1)).toHaveLength(1);
    for (const s of sb.shots) {
      const len = s.mediaId === "a" ? 3 : s.mediaId === "b" ? 4 : 30;
      expect(s.start + s.duration * s.speed).toBeLessThanOrEqual(len + 0.05);
    }
  });

  it("drops shots whose media was removed", () => {
    const sb = autoStoryboard([vid("a"), img("b")], "x");
    expect(cleanStoryboard(sb, [img("b")]).shots.map((s) => s.mediaId)).toEqual(["b"]);
  });
});

describe("wrapText", () => {
  it("wraps to short lines, three at most", () => {
    expect(wrapText("Handmade, one piece at a time.")).toBe("Handmade, one\npiece at a time.");
    expect(wrapText("one two three four five six seven eight nine ten eleven twelve thirteen fourteen").split("\n")).toHaveLength(3);
  });
});

describe("buildJob", () => {
  it("renders each shot, the end card, joins them and adds music when given", () => {
    const sb = autoStoryboard([vid("a"), img("b")], "Hello");
    const job = buildJob(sb, { a: { file: "a.mp4", kind: "video" }, b: { file: "b.jpg", kind: "image" } }, "music.mp3");
    expect(job.steps).toHaveLength(5);
    expect(job.texts["list.txt"]).toBe("file 'part0.mp4'\nfile 'part1.mp4'\nfile 'end.mp4'\n");
    expect(job.steps.at(-1)).toContain("music.mp3");
    expect(job.texts["text0.txt"]).toBe("Hello");
  });
});

let hasFfmpeg = false;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  hasFfmpeg = true;
} catch {
  /* no native ffmpeg on this machine */
}

describe.runIf(hasFfmpeg)("buildJob with real ffmpeg", () => {
  it("produces a 1080x1920 reel of the planned length", () => {
    const dir = mkdtempSync(join(tmpdir(), "reel-"));
    const run = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd: dir });
    run(["-f", "lavfi", "-i", "testsrc=s=1280x720:r=30:d=6", "-pix_fmt", "yuv420p", "a.mp4"]);
    run(["-f", "lavfi", "-i", "testsrc=s=800x1000:d=1", "-frames:v", "1", "b.jpg"]);
    run(["-f", "lavfi", "-i", "sine=f=440:d=30", "music.mp3"]);
    cpSync("public/fonts", join(dir, "fonts"), { recursive: true });
    cpSync("public/roopip-logo.png", join(dir, "fonts", "roopip-logo.png"));

    const sb = autoStoryboard([vid("a", 6), img("b")], "Handmade, one piece at a time");
    sb.shots[0].speed = 0.5;
    const job = buildJob(sb, { a: { file: "a.mp4", kind: "video" }, b: { file: "b.jpg", kind: "image" } }, "music.mp3");
    for (const [name, text] of Object.entries(job.texts)) writeFileSync(join(dir, name), text);
    for (const step of job.steps) run(step);

    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", job.output], { cwd: dir }).toString(),
    );
    const video = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    expect([video.width, video.height]).toEqual([1080, 1920]);
    expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
    expect(Math.abs(Number(probe.format.duration) - job.seconds)).toBeLessThan(0.5);
  }, 120_000);
});
