import { useEffect, useMemo } from "react";
import { DayCell } from "../components/DayCell";
import { addDays, shortDate, todayISO, weekStart } from "../lib/dates";
import type { Calendar } from "../lib/useCalendar";
import type { Slot } from "../lib/types";

const WEEKS = 4;

export function Overview({ cal, onOpen }: { cal: Calendar; onOpen: (s: Slot) => void }) {
  const today = todayISO();
  const start = weekStart(today);
  const end = addDays(start, 7 * WEEKS - 1);

  useEffect(() => {
    void cal.ensureRange(start, end);
  }, [start, end, cal.ensureRange]);

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
                  return <DayCell key={date} date={date} slots={upcoming.filter((s) => s.date === date)} onOpen={onOpen} />;
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
            const thumb = s.media.find((m) => m.thumbnail)?.thumbnail;
            return (
              <button
                key={s.id}
                className={`ig-cell ${thumb ? "" : "empty"}`}
                style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                onClick={() => onOpen(s)}
                title={`${shortDate(s.date)} · ${s.title}`}
              >
                {!thumb && `${shortDate(s.date)} · ${s.title}`}
              </button>
            );
          })}
        </div>
        <p className="ig-note">Newest top-left, the way your profile shows it. Check the colours flow and no two neighbours look the same.</p>
      </aside>
    </div>
  );
}
