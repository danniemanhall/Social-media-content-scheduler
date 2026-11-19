import { useThumbUrl } from "./Thumb";
import type { DragEvent } from "react";
import { FORMAT_LABEL, STATUS_LABEL } from "../lib/brand";
import type { Slot } from "../lib/types";

export function kindOf(slot: Slot) {
  return slot.format === "post" || slot.format === "carousel" ? "grid" : slot.format;
}

/** What an open slot asks for: "Story", "Reel" or "Grid post". */
export function needed(slot: Slot) {
  return kindOf(slot) === "grid" ? "Grid post" : FORMAT_LABEL[slot.format];
}

export function Tile({ slot, onOpen, draggable }: { slot: Slot; onOpen: (s: Slot) => void; draggable?: boolean }) {
  const thumb = useThumbUrl(slot.media.find((m) => m.thumbnail));
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData("text/slot-id", slot.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <button
      type="button"
      className={`tile ${kindOf(slot)} ${slot.ideaId ? "" : "open"}`}
      onClick={() => onOpen(slot)}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      title={slot.ideaId ? `${FORMAT_LABEL[slot.format]} · ${slot.title}` : `Click to make this ${needed(slot).toLowerCase()}`}
    >
      {thumb && <span className="thumb" style={{ backgroundImage: `url("${thumb}")` }} />}
      <span className="body">
        <span className="fmt">
          {FORMAT_LABEL[slot.format]} · {slot.time} {slot.locked && <span className="lock" aria-label="locked">🔒</span>}
          {slot.askClaude && <span className="ask" title="Waiting for Claude">✦</span>}
        </span>
        <span className="title">{slot.ideaId ? slot.title : `${needed(slot)} needed`}</span>
        {slot.ideaId ? (
          <span className={`status ${slot.status}`}>{STATUS_LABEL[slot.status]}</span>
        ) : (
          <span className="status open">Click to start</span>
        )}
        {slot.music === "instagram" && slot.song && slot.status !== "posted" && <span className="hand" title="Posted by hand with this Instagram song">♫ {slot.song.title}</span>}
      </span>
    </button>
  );
}
