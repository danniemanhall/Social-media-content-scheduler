import { useEffect, useMemo } from "react";
import { DayCell } from "../components/DayCell";
import { useThumbUrl } from "../components/Thumb";
import { addDays, shortDate, todayISO, weekStart } from "../lib/dates";
import type { Calendar } from "../lib/useCalendar";
import type { Slot } from "../lib/types";
import { KIND_LABEL, lastDay, occurrences, type BrandEvent } from "../lib/events";

const WEEKS = 4;

export function Overview({ cal, events = [], onOpen, onYear }: { cal: Calendar; events?: BrandEvent[]; onOpen: (s: Slot) => void; onYear?: () => void }) {
  const today = todayISO();
  const start = weekStart(today);
  const end = addDays(start, 7 * WEEKS - 1);

  useEffect(() => {
    void cal.ensureRange(start, end);
  }, [start, end, cal.ensureRange]);

  const occ = useMemo(() => occurrences(events, start, end), [events, start, end]);
  const comingUp = useMemo(() => {
    const horizon = addDays(today, 60);
    return occurrences(events, today, horizon).filter((e) => lastDay(e) >= today && (e.start <= horizon || (e.submitBy ?? "9999") <= horizon)).slice(0, 6);
  }, [events, today]);
  const upcoming = useMemo(() => cal.slots.filter((s) => s.date >= start && s.date <= end), [cal.slots, start, end]);
  const soon = addDays(today, 3);
  const stats = {
    needMedia: upcoming.filter((s) => s.date >= today && s.date <= soon && s.status === "idea").length,
    review: upcoming.filter((s) => s.status === "review").length,
    ready: upcoming.filter((s) => s.status === "approved" || s.status === "scheduled").length,
    claude: upcoming.filter((s) => s.askClaude).length,
  };

  // Instagram shows the newest post top-left, so lay the next 9 grid posts out that way.
  const gridPosts = useMemo(() => {
    const posted = cal.slots.filter((s) => (s.format === "post" || s.format === "carousel") && s.date >= addDays(today, -60));
    return posted.slice(-9).reverse();
  }, [cal.slots, today]);

  return (
    <div className="layout">
      <div>
        <div className="stats">
          <div className="stat"><div className="n">{stats.needMedia}</div><div className="l">Need photos or video in the next 3 days</div></div>
          <div className="stat"><div className="n">{stats.review}</div><div className="l">Waiting for Carli's approval</div></div>
          <div className="stat"><div className="n">{stats.ready}</div><div className="l">Approved and ready</div></div>
          <div className="stat"><div className="n">{stats.claude}</div><div className="l">Marked "Ask Claude"</div></div>
        </div>

        {comingUp.length > 0 && (
          <section className="coming-up">
            <div className="section-head">
              <h3>Coming up in the next 60 days</h3>
              <span className="spacer" />
              {onYear && <button className="btn small" onClick={onYear}>See the whole year</button>}
            </div>
            <div className="coming-list">
              {comingUp.map((e) => (
                <div key={e.id} className="coming-item">
                  <span className={`ym-swatch ev-${e.kind}`} />
                  <div>
                    <b>{e.title}</b>
                    <div className="ym-when">{shortDate(e.start)}{lastDay(e) !== e.start && ` to ${shortDate(lastDay(e))}`} · {KIND_LABEL[e.kind]}</div>
                    {e.submitBy && e.submitBy >= today && <div className="ym-task">⚑ Submit the deal by {shortDate(e.submitBy)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {Array.from({ length: WEEKS }, (_, w) => {
          const ws = addDays(start, 7 * w);
          return (
            <section className="week" key={ws}>
              <h3 className="week-title">
                {w === 0 ? "This week" : w === 1 ? "Next week" : `Week of ${shortDate(ws)}`} · {shortDate(ws)} to {shortDate(addDays(ws, 6))}
              </h3>
              <div className="days">
                {Array.from({ length: 7 }, (_, d) => {
                  const date = addDays(ws, d);
                  return (
                    <DayCell
                      key={date}
                      date={date}
                      slots={upcoming.filter((s) => s.date === date)}
                      onOpen={onOpen}
                      events={occ.filter((e) => e.start <= date && lastDay(e) >= date)}
                      deadlines={occ.filter((e) => e.submitBy === date)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="ig" aria-label="Instagram grid preview">
        <div className="ig-head">
          <img className="ig-avatar" src="/apple-touch-icon.png" alt="" />
          <div>
            <b>roopip</b>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Grid preview</div>
          </div>
        </div>
        <div className="ig-grid">
          {Array.from({ length: 9 }, (_, i) => {
            const s = gridPosts[i];
            if (!s) return <div key={i} className="ig-cell empty" />;
            return <IgCell key={s.id} slot={s} onOpen={onOpen} />;
          })}
        </div>
        <p className="ig-note">Newest top-left, the way your profile shows it. Check the colours flow and no two neighbours look the same.</p>
      </aside>
    </div>
  );
}

function IgCell({ slot: s, onOpen }: { slot: Slot; onOpen: (s: Slot) => void }) {
  const thumb = useThumbUrl(s.media.find((m) => m.thumbnail));
  return (
    <button
      className={`ig-cell ${thumb ? "" : "empty"}`}
      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
      onClick={() => onOpen(s)}
      title={`${shortDate(s.date)} · ${s.title}`}
    >
      {!thumb && `${shortDate(s.date)} · ${s.title}`}
    </button>
  );
}
