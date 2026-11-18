import { useEffect, useMemo, useState } from "react";
import { brandFit, FIT_OK, FIT_WARN, gridClash, lastUsedMap, SCENE_LABEL, sceneForSlot, suggestMedia, type Look } from "../lib/brandFit";
import { useDriveConnected } from "../lib/useDrive";
import type { MediaLibraryState } from "../lib/mediaIndex";
import type { MediaRef, Slot } from "../lib/types";
import { kindOf } from "./Tile";
import { Thumb } from "./Thumb";

/** Grid posts either side of this one (by date), for the "out of step" check. */
function gridNeighbours(slot: Slot, all: Slot[]): Slot[] {
  const grid = all
    .filter((s) => kindOf(s) === "grid" && s.id !== slot.id && s.media.length)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const key = slot.date + slot.time;
  const before = grid.filter((s) => s.date + s.time < key).slice(-3);
  const after = grid.filter((s) => s.date + s.time >= key).slice(0, 3);
  return [...before, ...after];
}

/** A small brand-fit badge and the reasons behind it, for one file on a post. */
export function FitNote({ media, slot, all, lib }: { media: MediaRef; slot: Slot; all: Slot[]; lib: MediaLibraryState }) {
  const [look, setLook] = useState<Look | null | undefined>(lib.looks[media.id]);
  useEffect(() => {
    let live = true;
    if (lib.looks[media.id]) setLook(lib.looks[media.id]);
    else void lib.lookFor(media).then((l) => live && setLook(l));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, lib.looks[media.id]]);

  const neighbourLooks = useMemo(() => {
    if (kindOf(slot) !== "grid") return [];
    return gridNeighbours(slot, all)
      .map((s) => lib.looks[s.media[0].id])
      .filter((l): l is Look => !!l);
  }, [slot, all, lib.looks]);

  if (look === undefined) return <div style={{ color: "var(--muted)" }}>Checking brand fit…</div>;
  if (look === null)
    return (
      <div style={{ color: "var(--muted)" }} title="Connect Google Drive on the Media tab so the app can read this file's colours.">
        Brand fit not checked yet
      </div>
    );

  const fit = brandFit(look);
  const clash = media.mimeType.startsWith("image/") ? gridClash(look, neighbourLooks) : [];
  const ok = fit.score >= FIT_OK && !clash.length;
  const reasons = [...fit.reasons, ...clash];
  return (
    <div className={ok ? "ok" : fit.score >= FIT_WARN ? "warnText" : "bad"} title={ok ? reasons.join(" ") : "How well the colours and light match Roopip's palette and photo style"}>
      {ok ? "✓ On brand" : "⚠ Brand check"}
      {!ok && reasons.length > 0 && (
        <ul className="fit-reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Best-matching photos and clips from the media folders, one click to add. */
export function SuggestedMedia({
  slot,
  all,
  lib,
  onAdd,
  onVideo,
}: {
  slot: Slot;
  all: Slot[];
  lib: MediaLibraryState;
  onAdd: (m: MediaRef) => void;
  /** Make B-roll from this photo. */
  onVideo?: (m: MediaRef) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const connected = useDriveConnected();
  const suggestions = useMemo(() => {
    if (!lib.index?.items.length) return [];
    return suggestMedia(slot, lib.index.items, lib.looks, lastUsedMap(all, slot.id), slot.date, 12, lib.tags);
  }, [slot, all, lib.index, lib.looks, lib.tags]);

  if (!lib.index) {
    return (
      <div className="hint" style={{ marginTop: 8 }}>
        Suggestions appear once the media folders have been scanned. Open the <b>Media</b> tab, connect Google Drive and click <b>Scan folders</b>.
      </div>
    );
  }
  if (!suggestions.length) return null;
  const wanted = sceneForSlot(slot);
  const FIRST = 6;
  const shown = showAll ? suggestions : suggestions.slice(0, FIRST);
  return (
    <div className="suggest">
      <div className="label" style={{ marginTop: 10 }}>
        Suggested for this post
      </div>
      {wanted &&
        (suggestions.some((s) => s.scene === wanted) ? (
          <div className="hint">The idea calls for a {SCENE_LABEL[wanted]}, so those come first.</div>
        ) : (
          <div className="hint warnText">
            The idea calls for a {SCENE_LABEL[wanted]}, but none of the photos in the media folders look like one{lib.progress ? " yet (still checking the photos)" : ""}. These are the closest matches. Add a folder of {wanted === "lifestyle" ? "styled photos taken in real rooms" : `${SCENE_LABEL[wanted]}s`} on the Media tab to get better suggestions.
          </div>
        ))}
      {!connected && (
        <div className="hint">Connect Google Drive on the Media tab to see these photos.</div>
      )}
      {lib.untagged > 0 && (
        <div className="hint">
          Claude has looked at {lib.index.items.length - lib.untagged} of {lib.index.items.length} photos and videos so far. The rest are matched on their names and colours until Claude has seen them; Claude looks at new ones on each run (about 7 AM, 12 PM and 8 PM).
        </div>
      )}
      <div className="suggest-row">
        {shown.map((s) => {
          const fitOk = s.fit && s.fit.score >= FIT_OK;
          const reasons = s.fit?.reasons ?? [];
          return (
            <div className="suggest-item" key={s.media.id}>
              <a href={s.media.link} target="_blank" rel="noopener noreferrer" title="Open in Drive">
                <Thumb media={s.media} className="img" />
              </a>
              <div className="name" title={`${s.media.path ?? ""}/${s.media.name}`}>{s.media.name.replace(/\.[a-z0-9]+$/i, "")}</div>
              {s.text && <div className="seen" title="What Claude saw in this picture">{s.text}</div>}
              <div className="why">{s.why.join(" · ")}</div>
              {s.fit && (
                <div className={fitOk ? "ok" : s.fit.score >= FIT_WARN ? "warnText" : "bad"} title={reasons.join(" ")}>
                  {fitOk ? "✓ On brand" : `⚠ ${reasons[0] ?? "Check against the brand"}`}
                </div>
              )}
              <button type="button" className="btn small" onClick={() => onAdd(s.media)}>
                Add to post
              </button>
              {onVideo && s.media.mimeType.startsWith("image/") && (
                <button type="button" className="btn small video-btn" onClick={() => onVideo(s.media)}>
                  🎬 Create video
                </button>
              )}
            </div>
          );
        })}
      </div>
      {suggestions.length > FIRST && (
        <button type="button" className="btn small" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show ${suggestions.length - FIRST} more suggestions`}
        </button>
      )}
    </div>
  );
}
