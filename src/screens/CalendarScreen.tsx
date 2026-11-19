import { useEffect, useMemo, useState } from "react";
import { DayCell } from "../components/DayCell";
import { addDays, monthName, shortDate, todayISO, weekStart } from "../lib/dates";
import type { Calendar } from "../lib/useCalendar";
import type { Slot } from "../lib/types";
import { lastDay, occurrences, type BrandEvent } from "../lib/events";
import type { EventsState } from "../lib/useEvents";
import { EventEditor } from "../components/EventEditor";

type View = "month" | "week";

export function CalendarScreen({ cal, ev, onOpen }: { cal: Calendar; ev?: EventsState; onOpen: (s: Slot) => void }) {
  const [editing, setEditing] = useState<BrandEvent | null>(null);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(todayISO());

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const gridStart = view === "month" ? weekStart(monthStart) : weekStart(anchor);
  const nextMonth = addDays(monthStart, 32).slice(0, 7) + "-01";
  const gridEnd = view === "month" ? addDays(weekStart(addDays(nextMonth, -1)), 6) : addDays(gridStart, 6);

  useEffect(() => {
    void cal.ensureRange(gridStart, gridEnd);
  }, [gridStart, gridEnd, cal.ensureRange]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d);
    return out;
  }, [gridStart, gridEnd]);

  const occ = useMemo(() => (ev ? occurrences(ev.visible, gridStart, gridEnd) : []), [ev, gridStart, gridEnd]);
  const openEvent = (id: string) => {
    const saved = ev?.events.find((e) => e.id === id);
    if (saved) setEditing(saved);
  };

  const step = (dir: number) => {
    if (view === "week") setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(dir > 0 ? nextMonth : addDays(monthStart, -1).slice(0, 7) + "-01");
  };

  const title = view === "month" ? monthName(monthStart) : `${shortDate(gridStart)} to ${shortDate(gridEnd)}`;

  return (
    <div>
      <div className="cal-toolbar">
        <h2 style={{ minWidth: 220 }}>{title}</h2>
        <button className="btn small" onClick={() => step(-1)} aria-label="Previous">‹</button>
        <button className="btn small" onClick={() => setAnchor(todayISO())}>Today</button>
        <button className="btn small" onClick={() => step(1)} aria-label="Next">›</button>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
          <button aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
        </div>
        <span className="spacer" />
        <div className="legend">
          <span><i style={{ background: "var(--reel)" }} />Reel</span>
          <span><i style={{ background: "var(--grid)" }} />Grid post</span>
          <span><i style={{ background: "var(--story)" }} />Story</span>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>Drag a post to another day. Use + on a day to add one.</p>
      <div className="dow-row">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className={`days ${view === "month" ? "month" : "weekview"}`}>
        {days.map((date) => (
          <DayCell
            key={date}
            date={date}
            other={view === "month" && date.slice(0, 7) !== monthStart.slice(0, 7)}
            slots={cal.slots.filter((s) => s.date === date)}
            onOpen={onOpen}
            onMove={(id, d) => void cal.move(id, d)}
            onAdd={async (d, f) => onOpen(await cal.add(d, f))}
            events={occ.filter((e) => e.start <= date && lastDay(e) >= date)}
            deadlines={occ.filter((e) => e.submitBy === date)}
            onEvent={(e) => openEvent(e.eventId)}
          />
        ))}
      </div>
      {editing && ev && (
        <EventEditor event={editing} onSave={(e) => void ev.save([e])} onRemove={(id) => void ev.remove(id)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
