import { useEffect, useMemo, useState } from "react";
import { EventEditor, blankEvent } from "../components/EventEditor";
import { addDays, dayOfWeek, monthName, shortDate, todayISO, weekStart } from "../lib/dates";
import { KIND_LABEL, lastDay, occurrences, parseEvents, type BrandEvent, type Occurrence } from "../lib/events";
import { DEFAULT_TEMPLATE } from "../lib/planner";
import { CHANNEL_LABEL } from "../lib/playbook";
import type { Store } from "../lib/store";
import type { Calendar } from "../lib/useCalendar";
import type { EventsState } from "../lib/useEvents";
import type { Slot, SlotKind } from "../lib/types";
import { kindOf } from "../components/Tile";

const MONTHS_AHEAD = 12;

function addMonths(firstOfMonth: string, n: number) {
  const y = Number(firstOfMonth.slice(0, 4));
  const m = Number(firstOfMonth.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
}

/** The whole year ahead on one scrolling page: events, sales, deal deadlines and the posting rhythm. */
export function YearScreen({ cal, ev, store, onOpen }: { cal: Calendar; ev: EventsState; store: Store; onOpen: (s: Slot) => void }) {
  const today = todayISO();
  const first = `${today.slice(0, 7)}-01`;
  const end = addDays(addMonths(first, MONTHS_AHEAD), -1);
  const [loaded, setLoaded] = useState<Slot[]>([]);
  const [editing, setEditing] = useState<BrandEvent | null>(null);
  const [importing, setImporting] = useState(false);

  // Read the posts already planned, without planning new weeks.
  useEffect(() => {
    let live = true;
    store.load(first, end).then((s) => live && setLoaded(s)).catch(() => {});
    return () => { live = false; };
  }, [store, first, end]);

  const slotsByDay = useMemo(() => {
    const byId = new Map(loaded.map((s) => [s.id, s]));
    for (const s of cal.slots) if (s.date >= first && s.date <= end) byId.set(s.id, s);
    const out = new Map<string, Slot[]>();
    for (const s of byId.values()) out.set(s.date, [...(out.get(s.date) ?? []), s]);
    return out;
  }, [loaded, cal.slots, first, end]);

  const occ = useMemo(() => occurrences(ev.visible, first, end), [ev.visible, first, end]);
  const cadence = useMemo(() => {
    const byDow = new Map<number, SlotKind[]>();
    for (const t of DEFAULT_TEMPLATE) if (!t.optional) byDow.set(t.dow, [...(byDow.get(t.dow) ?? []), t.kind]);
    return byDow;
  }, []);

  const edit = (o: Occurrence | BrandEvent) => {
    const saved = ev.events.find((e) => e.id === ("eventId" in o ? o.eventId : o.id));
    if (saved) setEditing(saved);
  };

  return (
    <div className="year">
      <div className="cal-toolbar">
        <h2 style={{ marginRight: 8 }}>The year ahead</h2>
        <button className="btn primary small" onClick={() => setEditing(blankEvent(today))}>+ Add event or sale</button>
        <button className="btn small" onClick={() => setImporting((v) => !v)} aria-expanded={importing}>Paste a year calendar</button>
        <span className="spacer" />
        <div className="legend">
          {(["marketplace", "sale", "holiday", "campaign", "market", "launch"] as const).map((k) => (
            <span key={k}><i className={`ev-${k}`} />{KIND_LABEL[k]}</span>
          ))}
          <span>⚑ Deal deadline</span>
        </div>
      </div>
      <p className="hint-text" style={{ marginTop: -6 }}>
        Scroll down through the next 12 months. Click a day to add an event, or an event to change it. Dots show the posting rhythm: <span className="yd reel" /> reel <span className="yd grid" /> grid <span className="yd story" /> story. Filled dots are planned posts.
      </p>
      {ev.error && <div className="banner error">{ev.error}</div>}
      {importing && <ImportBox onImport={(list) => { void ev.save(list); setImporting(false); }} />}

      {Array.from({ length: MONTHS_AHEAD }, (_, i) => {
        const m1 = addMonths(first, i);
        const mEnd = addDays(addMonths(m1, 1), -1);
        const gridStart = weekStart(m1);
        const gridEnd = addDays(weekStart(mEnd), 6);
        const days: string[] = [];
        for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
        const monthEvents = occ.filter((e) => (e.start <= mEnd && lastDay(e) >= m1) || (e.submitBy && e.submitBy >= m1 && e.submitBy <= mEnd));
        return (
          <section className="ym" key={m1}>
            <h3 className="ym-title">{monthName(m1)}</h3>
            <div className="ym-body">
              <div>
                <div className="ym-dow">{["M", "T", "W", "T", "F", "S", "S"].map((d, j) => <div key={j}>{d}</div>)}</div>
                <div className="ym-days">
                  {days.map((date) => {
                    if (date.slice(0, 7) !== m1.slice(0, 7)) return <div key={date} className="ym-day out" />;
                    const on = occ.filter((e) => e.start <= date && lastDay(e) >= date);
                    const deadlines = occ.filter((e) => e.submitBy === date);
                    const planned = slotsByDay.get(date) ?? [];
                    const kinds: { kind: SlotKind; slot?: Slot }[] = planned.length
                      ? planned.map((s) => ({ kind: kindOf(s) as SlotKind, slot: s }))
                      : date >= today ? (cadence.get(dayOfWeek(date)) ?? []).map((k) => ({ kind: k })) : [];
                    return (
                      <div
                        key={date}
                        className={`ym-day ${date === today ? "today" : ""} ${date < today ? "past" : ""}`}
                        onClick={() => setEditing(blankEvent(date))}
                        title={`Add an event on ${shortDate(date)}`}
                      >
                        <div className="ym-num">{Number(date.slice(8, 10))}{deadlines.length > 0 && <span className="flag" title={deadlines.map((e) => `Submit ${e.title} deal`).join(", ")}>⚑</span>}</div>
                        {on.slice(0, 2).map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            className={`ym-ev ev-${e.kind} ${e.start === date ? "first" : ""} ${lastDay(e) === date ? "last" : ""}`}
                            onClick={(x) => { x.stopPropagation(); edit(e); }}
                            title={`${e.title}${e.estimated ? " (estimated dates)" : ""}`}
                          >
                            {(e.start === date || dayOfWeek(date) === 1) ? e.title : " "}
                          </button>
                        ))}
                        {on.length > 2 && <div className="ym-more">+{on.length - 2}</div>}
                        <div className="ym-dots">
                          {kinds.map((k, j) => (
                            <button
                              key={j}
                              type="button"
                              className={`yd ${k.kind} ${k.slot ? "planned" : ""}`}
                              title={k.slot ? `${k.slot.title} (${k.slot.status})` : `${k.kind} day`}
                              onClick={(x) => { x.stopPropagation(); if (k.slot) onOpen(k.slot); }}
                              aria-label={k.slot ? k.slot.title : `${k.kind} day`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ym-list">
                {monthEvents.length === 0 && <p className="hint-text">Nothing on yet. A good month for evergreen styling, craft and customer stories.</p>}
                {monthEvents.map((e) => (
                  <button key={e.id} type="button" className="ym-item" onClick={() => edit(e)}>
                    <span className={`ym-swatch ev-${e.kind}`} />
                    <span className="ym-item-body">
                      <b>{e.title}</b>
                      <span className="ym-when">
                        {shortDate(e.start)}{lastDay(e) !== e.start && ` to ${shortDate(lastDay(e))}`} · {KIND_LABEL[e.kind]}
                        {e.estimated && <span className="chip est">estimate</span>}
                      </span>
                      {e.submitBy && <span className="ym-task">⚑ Submit the deal by {shortDate(e.submitBy)}</span>}
                      {e.channels?.length ? <span className="ym-when">{e.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}</span> : null}
                      {e.notes && <span className="ym-notes">{e.notes}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {editing && (
        <EventEditor
          event={editing}
          onSave={(e) => void ev.save([e])}
          onRemove={(id) => void ev.remove(id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ImportBox({ onImport }: { onImport: (e: BrandEvent[]) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseEvents(text), [text]);
  return (
    <div className="card import-box">
      <h3>Paste your year calendar</h3>
      <p className="hint-text">
        One event per line: the date (or "start to end"), the name, then any notes. Copying rows straight from a Google Sheet works too.
        For example: <code>2027-03-01 to 2027-03-07, Autumn sale in the shop, 20% off placemats</code>
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"14 Feb 2027, Valentine's table for two\n2027-04-10 to 2027-04-11, Knysna Easter market, stall 12"} />
      {text.trim() && (
        <p className="hint-text">
          {parsed.events.length} event{parsed.events.length === 1 ? "" : "s"} found
          {parsed.skipped.length > 0 && `, ${parsed.skipped.length} line${parsed.skipped.length === 1 ? "" : "s"} skipped (no date or name): ${parsed.skipped.slice(0, 2).join(" / ")}`}
        </p>
      )}
      {parsed.events.length > 0 && (
        <ul className="import-preview">
          {parsed.events.slice(0, 12).map((e) => (
            <li key={e.id}><b>{shortDate(e.start)}{e.end ? ` to ${shortDate(e.end)}` : ""}</b> {e.title} <span className="chip">{KIND_LABEL[e.kind]}</span></li>
          ))}
          {parsed.events.length > 12 && <li>…and {parsed.events.length - 12} more</li>}
        </ul>
      )}
      <button className="btn primary" disabled={!parsed.events.length} onClick={() => onImport(parsed.events)}>
        Add {parsed.events.length || ""} to the calendar
      </button>
    </div>
  );
}
