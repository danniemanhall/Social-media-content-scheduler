import { useEffect, useMemo, useRef, useState } from "react";
import { FORMAT_LABEL } from "../lib/brand";
import { defaultBriefMonth, monthRange, shiftMonth, type BriefLink } from "../lib/brief";
import { dayName, monthName, shortDate, todayISO } from "../lib/dates";
import type { Store } from "../lib/store";
import type { Slot } from "../lib/types";
import type { Calendar } from "../lib/useCalendar";

/**
 * The month brief for the content creator: pick a month, add a note to any
 * post, then copy the read-only link for her (or print it to PDF). The
 * preview on the right is the exact page she sees.
 */
export function BriefScreen({ cal, store }: { cal: Calendar; store: Store }) {
  const [month, setMonth] = useState(() => defaultBriefMonth(todayISO()));
  const [link, setLink] = useState<BriefLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [version, setVersion] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const { from, to } = monthRange(month);

  useEffect(() => {
    void cal.ensureRange(from, to);
  }, [from, to, cal.ensureRange]);

  useEffect(() => {
    if (store.mode !== "shared") return;
    fetch("/api/brief-link")
      .then((r) => (r.ok ? (r.json() as Promise<BriefLink>) : Promise.reject(new Error(`${r.status}`))))
      .then(setLink)
      .catch((e) => setLinkError(`Couldn't get the share link (${e instanceof Error ? e.message : e}).`));
  }, [store.mode]);

  const posts = useMemo(
    () => cal.slots.filter((s) => s.date >= from && s.date <= to && (s.ideaId || s.title.trim())),
    [cal.slots, from, to],
  );
  const open = cal.slots.filter((s) => s.date >= from && s.date <= to).length - posts.length;

  const url = link ? `${location.origin}/brief/${link.token}?m=${month}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    const r = await fetch("/api/brief-link/reset", { method: "POST" });
    if (r.ok) {
      setLink((await r.json()) as BriefLink);
      setVersion((v) => v + 1);
    } else setLinkError(`Couldn't make a new link (${r.status}).`);
  };

  const saveNote = async (s: Slot, note: string) => {
    const briefNote = note.trim() || undefined;
    if ((s.briefNote ?? undefined) === briefNote) return;
    await cal.update({ ...s, briefNote });
    setVersion((v) => v + 1);
  };

  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (frame.current && doc?.body) frame.current.style.height = `${doc.documentElement.scrollHeight + 4}px`;
  };

  return (
    <div>
      <div className="cal-toolbar">
        <h2 style={{ minWidth: 220 }}>Brief for {monthName(`${month}-01`)}</h2>
        <button className="btn small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
        <button className="btn small" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        <span className="spacer" />
        {link && (
          <>
            <button className="btn primary" onClick={() => void copy()}>{copied ? "Link copied" : "Copy link for your creator"}</button>
            <a className="btn" href={url} target="_blank" rel="noopener">Open to print or save PDF</a>
          </>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6, maxWidth: 720 }}>
        Your content creator sees one simple card per planned post (what to shoot, the photos to use, the Canva size and the caption) and a
        shoot list grouped by photo session. She can only view it, and it always shows the latest plan, so you never need to send it twice.
      </p>
      {store.mode !== "shared" && <div className="banner warn">The share link needs the shared calendar. Open the live site to share a brief.</div>}
      {linkError && <div className="banner error">{linkError}</div>}

      <div className="brief-layout">
        <section className="brief-notes">
          <h3>Notes for her</h3>
          <p className="hint">Anything she needs from you that isn't in the plan: a prop, a colour, who to shoot with. Saved when you click away.</p>
          {posts.length === 0 && <p className="hint">Nothing planned in this month yet.</p>}
          {posts.map((s) => (
            <label key={s.id} className="brief-note">
              <span>
                <b>{dayName(s.date)} {shortDate(s.date)}</b> · {FORMAT_LABEL[s.format]} · {s.title}
              </span>
              <textarea
                key={`${s.id}-${s.briefNote ?? ""}`}
                defaultValue={s.briefNote ?? ""}
                placeholder="Optional note"
                rows={2}
                onBlur={(e) => void saveNote(s, e.target.value)}
              />
            </label>
          ))}
          {open > 0 && <p className="hint">{open} open {open === 1 ? "slot isn't" : "slots aren't"} planned yet, so {open === 1 ? "it's" : "they're"} not on the brief.</p>}
          {link && (
            <div className="brief-reset">
              {confirmReset ? (
                <>
                  <p className="hint">The old link stops working straight away. You'll need to send her the new one.</p>
                  <button className="btn small danger" onClick={() => void reset()}>Yes, make a new link</button>{" "}
                  <button className="btn small ghost" onClick={() => setConfirmReset(false)}>Keep this link</button>
                </>
              ) : (
                <button className="btn small ghost" onClick={() => setConfirmReset(true)}>Make a new link (stops the old one)</button>
              )}
            </div>
          )}
        </section>
        <section className="brief-preview">
          {link ? (
            <iframe ref={frame} key={`${link.token}-${month}-${version}`} title="What your creator sees" src={`/brief/${link.token}?m=${month}&embed=1`} onLoad={fit} />
          ) : (
            <p className="hint">{store.mode === "shared" ? "Loading the preview…" : "The preview shows on the live site."}</p>
          )}
        </section>
      </div>
    </div>
  );
}
