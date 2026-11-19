import { useEffect, useState } from "react";
import { canvaStatus, connectCanva, listDesigns, pullDesign, shapeNote, type CanvaDesign, type CanvaStatus } from "../../lib/canva";
import type { MediaRef, Slot } from "../../lib/types";
import { CanvaPanel } from "../CanvaPanel";
import { FORMAT_LABEL } from "../../lib/brand";

const kindWord = (s: Slot) => (s.format === "post" || s.format === "carousel" ? "grid post" : FORMAT_LABEL[s.format].toLowerCase());

/**
 * Roopip's Canva designs, newest first, to pick one for the post. Clicking a
 * design asks "Do you want to pull in this design?"; yes exports it at the
 * post's size and saves it to Drive.
 */
export function CanvaBrowser({
  slot,
  save,
  onPulled,
  onCancel,
}: {
  slot: Slot;
  save: (patch: Partial<Slot>) => void;
  onPulled: (design: CanvaDesign, media: MediaRef[]) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [more, setMore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CanvaDesign | null>(null);
  const [asVideo, setAsVideo] = useState(slot.format === "reel");
  const [step, setStep] = useState<string | null>(null);

  useEffect(() => void canvaStatus().then(setStatus), []);

  const load = async (q: string, cont?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listDesigns(q, cont);
      setDesigns((d) => (cont ? [...d, ...r.designs] : r.designs));
      setMore(r.continuation);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (String(e).includes("isn't connected")) setStatus((s) => (s ? { ...s, connected: false } : s));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status?.connected) void load(search);
  }, [status?.connected, search]);

  const connect = async () => {
    setError(null);
    try {
      await connectCanva();
      setStatus(await canvaStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pull = async () => {
    if (!picked) return;
    setError(null);
    try {
      const media = await pullDesign(picked, slot, asVideo, setStep);
      onPulled(picked, media);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  if (!status) return <p className="hint">Checking the Canva connection…</p>;

  if (!status.configured) {
    return (
      <div className="flow-card">
        <p>
          The Canva browser isn't switched on yet. It needs a one-time setup in Canva's developer portal (about 10 minutes; steps in <code>docs/canva-setup.md</code>).
        </p>
        <p className="hint">Until then, paste the design's link here and Claude exports it on its next run.</p>
        <CanvaPanel slot={slot} save={save} />
        <div className="flow-nav">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="flow-card">
        <p>Connect Roopip's Canva account once, and everyone can pick designs from it here.</p>
        <button type="button" className="btn primary" onClick={connect}>Connect Canva</button>{" "}
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        {error && <div className="bad">{error}</div>}
      </div>
    );
  }

  if (picked) {
    const shape = shapeNote(picked, slot.format);
    return (
      <div className="flow-card canva-confirm">
        {picked.thumbnail && <img src={picked.thumbnail} alt={picked.title} />}
        <div>
          <h3>Do you want to pull in this design?</h3>
          <p>
            <b>{picked.title}</b>
            {picked.pages && picked.pages > 1 ? ` · ${picked.pages} pages, each one a ${slot.format === "story" ? "story frame" : "carousel photo"}` : ""}
          </p>
          {shape && <div className={shape.ok ? "ok" : "warnText"}>{shape.text}</div>}
          {(slot.format === "story" || slot.format === "reel") && (
            <label className="toggle">
              <input type="checkbox" checked={asVideo} onChange={(e) => setAsVideo(e.target.checked)} /> It's animated or has video, so bring it in as a video
            </label>
          )}
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={pull} disabled={!!step}>
              {step ?? "Yes, pull it in"}
            </button>
            <button type="button" className="btn" onClick={() => setPicked(null)} disabled={!!step}>
              Cancel
            </button>
          </div>
          {error && <div className="bad">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flow-card">
      <form
        className="canva-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <input type="search" placeholder="Search Roopip's Canva designs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn">Search</button>
        <span className="hint">{status.name ? `Connected as ${status.name}` : "Connected"}</span>
      </form>
      {error && <div className="bad">{error}</div>}
      <div className="canva-grid">
        {designs.map((d) => {
          const shape = shapeNote(d, slot.format);
          return (
            <button key={d.id} type="button" className="canva-design" onClick={() => setPicked(d)} title={d.title}>
              <span className="canva-thumb">{d.thumbnail ? <img src={d.thumbnail} alt="" loading="lazy" /> : "No preview"}</span>
              <span className="name">{d.title}</span>
              <span className={`hint ${shape && !shape.ok ? "warnText" : ""}`}>
                {d.pages && d.pages > 1 ? `${d.pages} pages · ` : ""}
                {shape ? (shape.ok ? `Fits a ${kindWord(slot)}` : "Different shape") : ""}
              </span>
            </button>
          );
        })}
      </div>
      {loading && <p className="hint">Loading designs…</p>}
      {!loading && !designs.length && !error && <p className="hint">No designs found{search ? ` for "${search}"` : ""}.</p>}
      <div className="flow-nav">
        {more && (
          <button type="button" className="btn" onClick={() => load(search, more)} disabled={loading}>
            Show more designs
          </button>
        )}
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
