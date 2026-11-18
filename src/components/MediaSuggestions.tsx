import { useEffect, useMemo, useState } from "react";
import { brandFit, FIT_OK, FIT_WARN, gridClash, lastUsedMap, suggestMedia, type Look } from "../lib/brandFit";
import { driveConnected } from "../lib/drive";
import type { MediaLibraryState } from "../lib/mediaIndex";
import type { MediaRef, Slot } from "../lib/types";
import { kindOf } from "./Tile";

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
  const reasons = [...fit.reasons, ...clash];
  const cls = fit.score >= FIT_OK && !clash.length ? "ok" : fit.score >= FIT_WARN ? "warnText" : "bad";
  return (
    <div className={cls}>
      <span title="How well the colours and light match Roopip's palette and photo style">
        {fit.score >= FIT_OK && !clash.length ? "✓ On brand" : "⚠ Brand check"} ({fit.score})
      </span>
      {reasons.length > 0 && (
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
export function SuggestedMedia({ slot, all, lib, onAdd }: { slot: Slot; all: Slot[]; lib: MediaLibraryState; onAdd: (m: MediaRef) => void }) {
  const [more, setMore] = useState(false);
  const suggestions = useMemo(() => {
    if (!lib.index?.items.length) return [];
    return suggestMedia(slot, lib.index.items, lib.looks, lastUsedMap(all, slot.id), slot.date, 12);
  }, [slot, all, lib.index, lib.looks]);

  if (!lib.index) {
    return (
      <div className="hint" style={{ marginTop: 8 }}>
        Suggestions appear once the media folders have been scanned. Open the <b>Media</b> tab, connect Google Drive and click <b>Scan folders</b>.
      </div>
    );
  }
  if (!suggestions.length) return null;
  const shown = more ? suggestions : suggestions.slice(0, 4);
  return (
    <div className="suggest">
      <div className="label" style={{ marginTop: 10 }}>
        Suggested for this post
        {!driveConnected() && <span className="hint"> (connect Drive on the Media tab to see previews)</span>}
      </div>
      <div className="suggest-row">
        {shown.map((s) => (
          <div className="suggest-item" key={s.media.id} title={`${s.media.path ?? ""}/${s.media.name}`}>
            <div className="img" style={{ backgroundImage: s.media.thumbnail ? `url("${s.media.thumbnail}")` : undefined }}>
              {!s.media.thumbnail && (s.media.mimeType.startsWith("video/") ? "▶" : "◻")}
              {s.fit && <span className={`fit-badge ${s.fit.score >= FIT_OK ? "ok" : s.fit.score >= FIT_WARN ? "warn" : "bad"}`}>{s.fit.score}</span>}
            </div>
            <div className="why">{s.why.slice(0, 2).join(", ") || s.media.name}</div>
            <button type="button" className="btn small" onClick={() => onAdd(s.media)}>
              Add
            </button>
          </div>
        ))}
      </div>
      {suggestions.length > 4 && (
        <button type="button" className="btn ghost small" onClick={() => setMore(!more)}>
          {more ? "Fewer" : `${suggestions.length - 4} more`}
        </button>
      )}
    </div>
  );
}
