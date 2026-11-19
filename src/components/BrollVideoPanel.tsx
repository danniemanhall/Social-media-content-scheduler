import { useMemo, useState } from "react";
import { lastUsedMap, pickBrollPhotos, type IndexedMedia } from "../lib/brandFit";
import { BROLL_MOVES, BROLL_VIDEO_PHOTOS, BROLL_VIDEO_SHOT, brollPlan, brollVideoName, planSeconds } from "../lib/broll";
import type { MediaLibraryState } from "../lib/mediaIndex";
import type { Progress } from "../lib/render";
import type { MediaRef, Slot } from "../lib/types";
import { Thumb } from "./Thumb";

const strip = (m: IndexedMedia): MediaRef => {
  const { path: _p, ...ref } = m;
  return ref;
};

/**
 * One click: picks the lifestyle photos that best fit the post's idea and
 * films each with a slow handheld-style move, joined into one vertical video.
 * Any photo can be swapped out before making it.
 */
export function BrollVideoPanel({ slot, all, lib, save, onClose }: { slot: Slot; all: Slot[]; lib: MediaLibraryState; save: (patch: Partial<Slot>) => void; onClose: () => void }) {
  const ranked = useMemo(
    () => (lib.index ? pickBrollPhotos(slot, lib.index.items, lib.looks, lastUsedMap(all, slot.id), slot.date, lib.tags, 30) : []),
    // Pick once when the panel opens, so the choice doesn't shift while it's being made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.index],
  );
  const [skipped, setSkipped] = useState<string[]>([]);
  const [count, setCount] = useState(BROLL_VIDEO_PHOTOS);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const chosen = ranked.filter((s) => !skipped.includes(s.media.id)).slice(0, count);
  const plan = brollPlan(chosen.map((s) => s.media));
  const seconds = Math.round(planSeconds(plan));

  const make = async () => {
    setError(null);
    setDone(false);
    try {
      const { renderBrollVideo } = await import("../lib/render");
      const video = await renderBrollVideo(plan.map((p) => ({ ...p, photo: strip(p.photo) })), setProgress);
      setProgress({ value: 1, label: "Saving the video to Drive…" });
      const { BROLL_FOLDER, connectDrive, saveToAppFolder } = await import("../lib/drive");
      await connectDrive();
      const { isFolder: _f, ...ref } = await saveToAppFolder(BROLL_FOLDER, brollVideoName(slot.title), video, "video/mp4");
      save({ media: [...slot.media, { ...ref, width: ref.width ?? 1080, height: ref.height ?? 1920, durationSec: ref.durationSec ?? seconds }] });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="broll" role="group" aria-label="Make a B-roll video for this post">
      <div className="broll-head">
        <div style={{ flex: 1 }}>
          <b>B-roll video for this post</b>
          <div className="hint">
            The lifestyle photos that best fit the idea, each filmed like a phone in a steady hand (with quick close-ups of the rope detail) and cut together. Nothing added or relit. Swap out any photo that doesn't feel right.
          </div>
        </div>
        <button className="btn ghost small" type="button" onClick={onClose} aria-label="Close B-roll video">✕</button>
      </div>
      {!lib.index ? (
        <div className="hint">Scan the media folders on the Media tab first.</div>
      ) : !chosen.length ? (
        <div className="hint warnText">No lifestyle photos found in the media folders. Add a folder of photos taken in real rooms on the Media tab.</div>
      ) : (
        <>
          <div className="bv-shots">
            {plan.map(({ photo, move, closeUp }, i) => {
              const s = chosen[i];
              return (
                <div className="bv-shot" key={photo.id}>
                  <Thumb media={photo} className="mthumb" />
                  <div className="hint">
                    {i + 1}. {BROLL_MOVES[move].label}
                    {closeUp > 0 && " + close-up"}
                  </div>
                  {s.text && <div className="seen" title="What Claude saw in this picture">{s.text}</div>}
                  <button type="button" className="btn ghost small" disabled={!!progress} onClick={() => setSkipped((k) => [...k, photo.id])} title="Use the next best photo instead">
                    Swap
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Shots
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!!progress}>
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} ({Math.round(n * BROLL_VIDEO_SHOT)}s)
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary small" type="button" style={{ flex: "none" }} onClick={make} disabled={!!progress || !plan.length}>
              Make {seconds}-second video
            </button>
            {progress && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
                <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
                <span>{progress.label}</span>
              </div>
            )}
          </div>
          {chosen.length < count && <div className="hint">Only {chosen.length} lifestyle photos fit this idea.</div>}
          {!progress && !done && !error && <div className="hint">Made in this browser, roughly 30 seconds a shot on a laptop. Saved to the "Roopip B-roll" folder in Drive and added to this post.</div>}
          {done && <div className="ok">Added the video to this post. It's silent, so add music in the reel editor or when posting.</div>}
          {error && <div className="bad">{error}</div>}
        </>
      )}
    </div>
  );
}
