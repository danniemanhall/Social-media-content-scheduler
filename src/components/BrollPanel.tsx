import { useState } from "react";
import { BROLL_MOVES, BROLL_SECONDS, brollName, type BrollMove } from "../lib/broll";
import type { Progress } from "../lib/render";
import type { MediaRef, Slot } from "../lib/types";
import { Thumb } from "./Thumb";

const ALL = Object.keys(BROLL_MOVES) as BrollMove[];

/**
 * Makes short B-roll clips from one photo and adds them to the post. The clips
 * only move the framing, like a camera on a slider; the photo's light and
 * colours are untouched.
 */
export function BrollPanel({ slot, photo, save, onClose }: { slot: Slot; photo: MediaRef; save: (patch: Partial<Slot>) => void; onClose: () => void }) {
  const wide = !!photo.width && !!photo.height && photo.width / photo.height > 1.1;
  const [moves, setMoves] = useState<BrollMove[]>(wide ? ["pan", "push", "detail"] : ["pan", "tilt", "detail"]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const toggle = (m: BrollMove) => setMoves((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : ALL.filter((x) => x === m || cur.includes(x))));

  const make = async () => {
    setError(null);
    setDone(0);
    try {
      const { renderBroll } = await import("../lib/render");
      const clips = await renderBroll(photo, moves, setProgress);
      setProgress({ value: 1, label: "Saving the clips to Drive…" });
      const { BROLL_FOLDER, connectDrive, saveToAppFolder } = await import("../lib/drive");
      await connectDrive();
      const added: MediaRef[] = [];
      for (const c of clips) {
        const { isFolder: _f, ...ref } = await saveToAppFolder(BROLL_FOLDER, brollName(photo.name, c.move), c.video, "video/mp4");
        added.push({ ...ref, width: ref.width ?? 1080, height: ref.height ?? 1920, durationSec: ref.durationSec ?? BROLL_SECONDS });
      }
      save({ media: [...slot.media, ...added] });
      setDone(added.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="broll" role="group" aria-label="Make B-roll from a photo">
      <div className="broll-head">
        <Thumb media={photo} className="mthumb broll-thumb" />
        <div style={{ flex: 1 }}>
          <b>Create video from {photo.name.replace(/\.[a-z0-9]+$/i, "")}</b>
          <div className="hint">
            {BROLL_SECONDS}-second vertical clips that glide across the photo like a camera on a slider. Nothing is added or relit: same photo, same light, just a slow, smooth camera move.
          </div>
        </div>
        <button className="btn ghost small" type="button" onClick={onClose} aria-label="Close B-roll">✕</button>
      </div>
      <div className="broll-moves">
        {ALL.map((m) => (
          <label key={m} className="toggle" title={BROLL_MOVES[m].hint}>
            <input type="checkbox" checked={moves.includes(m)} onChange={() => toggle(m)} disabled={!!progress} />
            <span>
              {BROLL_MOVES[m].label}
              <span className="hint"> · {BROLL_MOVES[m].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="btn primary small" type="button" style={{ flex: "none" }} onClick={make} disabled={!!progress || !moves.length}>
          Make {moves.length} {moves.length === 1 ? "clip" : "clips"}
        </button>
        {progress && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
            <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
            <span>{progress.label}</span>
          </div>
        )}
      </div>
      {!progress && !done && !error && <div className="hint">Made in this browser, about a minute a clip on a laptop. Saved to the "Roopip B-roll" folder in Drive and added to this post.</div>}
      {done > 0 && <div className="ok">Added {done} {done === 1 ? "clip" : "clips"} to this post. Use them in the reel editor or as story frames.</div>}
      {error && <div className="bad">{error}</div>}
    </div>
  );
}
