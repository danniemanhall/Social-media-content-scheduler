import { useState, type DragEvent } from "react";
import { Tile } from "./Tile";
import { dayName, shortDate, todayISO } from "../lib/dates";
import type { Format, Slot } from "../lib/types";

interface Props {
  date: string;
  slots: Slot[];
  onOpen: (s: Slot) => void;
  onMove?: (id: string, date: string) => void;
  onAdd?: (date: string, format: Format) => void;
  other?: boolean;
}

export function DayCell({ date, slots, onOpen, onMove, onAdd, other }: Props) {
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const cls = ["day", date === today && "today", date < today && "past", over && "drop", other && "other"].filter(Boolean).join(" ");

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData("text/slot-id");
    if (id && onMove) onMove(id, date);
  };

  return (
    <div
      className={cls}
      onDragOver={onMove ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onMove ? onDrop : undefined}
    >
      <div className="day-head">
        <span>
          <b>{dayName(date)}</b> {shortDate(date)}
        </span>
        {onAdd && (
          <button type="button" className="add" onClick={() => setAdding((a) => !a)} aria-label={`Add a post on ${shortDate(date)}`}>
            +
          </button>
        )}
      </div>
      {adding && onAdd && (
        <div className="add-menu">
          {(["reel", "post", "carousel", "story"] as Format[]).map((f) => (
            <button key={f} type="button" className="btn small" onClick={() => { setAdding(false); onAdd(date, f); }}>
              {f}
            </button>
          ))}
        </div>
      )}
      {slots.map((s) => (
        <Tile key={s.id} slot={s} onOpen={onOpen} draggable={!!onMove} />
      ))}
    </div>
  );
}
