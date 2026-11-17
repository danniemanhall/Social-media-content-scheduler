import type { DragEvent } from "react";
import { FORMAT_LABEL, STATUS_LABEL } from "../lib/brand";
import type { Slot } from "../lib/types";

export function kindOf(slot: Slot) {
  return slot.format === "post" || slot.format === "carousel" ? "grid" : slot.format;
}

export function Tile({ slot, onOpen, draggable }: { slot: Slot; onOpen: (s: Slot) => void; draggable?: boolean }) {
  const thumb = slot.media.find((m) => m.thumbnail)?.thumbnail;
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData("text/slot-id", slot.id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <button
      type="button"
      className={`tile ${kindOf(slot)}`}
      onClick={() => onOpen(slot)}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      title={`${FORMAT_LABEL[slot.format]} · ${slot.title}`}
    >
      {thumb && <span className="thumb" style={{ backgroundImage: `url("${thumb}")` }} />}
      <span className="body">
        <span className="fmt">
          {FORMAT_LABEL[slot.format]} · {slot.time} {slot.locked && <span className="lock" aria-label="locked">🔒</span>}
          {slot.askClaude && <span className="ask" title="Waiting for Claude">✦</span>}
        </span>
        <span className="title">{slot.title}</span>
        <span className={`status ${slot.status}`}>{STATUS_LABEL[slot.status]}</span>
      </span>
    </button>
  );
}
