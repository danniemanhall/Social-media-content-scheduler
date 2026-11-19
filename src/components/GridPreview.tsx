import { useMemo } from "react";
import { shortDate } from "../lib/dates";
import type { Slot } from "../lib/types";
import { useThumbUrl } from "./Thumb";

/** Posts that land on the profile grid: grid posts, carousels and reels (they're shared to the feed). */
export function onGrid(s: Slot) {
  return s.format !== "story" && s.media.length > 0 && ["approved", "scheduled", "posted"].includes(s.status);
}

/**
 * The profile grid as it will look: posted, then scheduled and approved posts
 * in the order they go out, newest top-left the way Instagram shows it.
 */
export function gridOrder(slots: Slot[], include?: string): Slot[] {
  return slots
    .filter((s) => onGrid(s) || (s.id === include && s.format !== "story"))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .reverse();
}

export function GridPreview({ slots, highlight, onOpen, cells = 12 }: { slots: Slot[]; highlight?: string; onOpen?: (s: Slot) => void; cells?: number }) {
  const order = useMemo(() => gridOrder(slots, highlight).slice(0, cells), [slots, highlight, cells]);
  return (
    <div className="ig-grid">
      {Array.from({ length: cells }, (_, i) => {
        const s = order[i];
        if (!s) return <div key={i} className="ig-cell empty" />;
        return <GridCell key={s.id} slot={s} on={s.id === highlight} onOpen={onOpen} />;
      })}
    </div>
  );
}

function GridCell({ slot: s, on, onOpen }: { slot: Slot; on: boolean; onOpen?: (s: Slot) => void }) {
  const thumb = useThumbUrl(s.media.find((m) => m.thumbnail) ?? s.media[0]);
  const label = s.status === "posted" ? "Posted" : `${s.status === "scheduled" ? "Goes out" : "Approved for"} ${shortDate(s.date)}`;
  return (
    <button
      type="button"
      className={`ig-cell ${thumb ? "" : "empty"} ${on ? "highlight" : ""} ${s.status !== "posted" ? "upcoming" : ""}`}
      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
      onClick={() => onOpen?.(s)}
      title={`${shortDate(s.date)} ${s.time} · ${s.title}`}
    >
      <span className="ig-cell-label">
        {s.format === "reel" ? "▶ " : s.format === "carousel" ? "❐ " : ""}
        {on && s.status !== "posted" && !["approved", "scheduled"].includes(s.status) ? "This post" : label}
      </span>
    </button>
  );
}
