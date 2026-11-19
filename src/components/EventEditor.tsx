import { useEffect, useState } from "react";
import { KIND_LABEL, leadDays, type BrandEvent, type EventKind } from "../lib/events";
import { CHANNEL_LABEL, type Channel } from "../lib/playbook";

const CHANNELS: Channel[] = ["amazon", "takealot", "yaga", "website", "shop"];

export function blankEvent(date: string): BrandEvent {
  return { id: `added-${crypto.randomUUID().slice(0, 8)}`, title: "", kind: "sale", start: date, source: "added" };
}

/** Side panel to add or change one event. */
export function EventEditor({ event, onSave, onRemove, onClose }: {
  event: BrandEvent;
  onSave: (e: BrandEvent) => void;
  onRemove?: (id: string) => void;
  onClose: () => void;
}) {
  const [e, setE] = useState<BrandEvent>(event);
  useEffect(() => setE(event), [event]);
  useEffect(() => {
    const onKey = (k: KeyboardEvent) => k.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<BrandEvent>) => setE((x) => ({ ...x, ...patch }));
  const toggle = (c: Channel) => {
    const has = e.channels?.includes(c);
    const next = has ? e.channels!.filter((x) => x !== c) : [...(e.channels ?? []), c];
    set({ channels: next.length ? next : undefined });
  };
  const valid = e.title.trim() && e.start && (!e.end || e.end >= e.start);
  const isNew = !event.title;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer event-editor" role="dialog" aria-modal="true" aria-label={isNew ? "Add an event" : e.title}>
        <header>
          <h2 style={{ flex: 1 }}>{isNew ? "Add an event or sale" : "Edit event"}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="field">
          <label htmlFor="ev-title">Name</label>
          <input id="ev-title" type="text" value={e.title} placeholder="e.g. Winter sale in the shop" onChange={(x) => set({ title: x.target.value })} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="ev-kind">Type</label>
          <select id="ev-kind" value={e.kind} onChange={(x) => set({ kind: x.target.value as EventKind })}>
            {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="ev-start">Starts</label>
            <input id="ev-start" type="date" value={e.start} onChange={(x) => set({ start: x.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ev-end">Ends (optional)</label>
            <input id="ev-end" type="date" value={e.end ?? ""} min={e.start} onChange={(x) => set({ end: x.target.value || undefined })} />
          </div>
        </div>
        <div className="field">
          <div className="label">Where people can buy</div>
          <div className="chips">
            {CHANNELS.map((c) => (
              <label key={c} className="check-chip">
                <input type="checkbox" checked={!!e.channels?.includes(c)} onChange={() => toggle(c)} /> {CHANNEL_LABEL[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="ev-submit">Submit deal by (Amazon / Takealot)</label>
            <input id="ev-submit" type="date" value={e.submitBy ?? ""} max={e.start} onChange={(x) => set({ submitBy: x.target.value || undefined })} />
          </div>
          <div className="field">
            <label htmlFor="ev-lead">Start talking about it</label>
            <select id="ev-lead" value={leadDays(e)} onChange={(x) => set({ leadDays: Number(x.target.value) })}>
              {[0, 3, 7, 10, 14, 21, 28, 42].map((n) => <option key={n} value={n}>{n === 0 ? "On the day" : `${n} days before`}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ev-notes">The angle (what to say, which products)</label>
          <textarea id="ev-notes" value={e.notes ?? ""} onChange={(x) => set({ notes: x.target.value || undefined })} style={{ minHeight: 90 }} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="ev-repeat">Repeats</label>
            <select id="ev-repeat" value={e.repeat ?? ""} onChange={(x) => set({ repeat: (x.target.value || undefined) as BrandEvent["repeat"] })}>
              <option value="">Once</option>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
            </select>
          </div>
          <div className="field">
            <div className="label">Dates</div>
            <label className="check-chip">
              <input type="checkbox" checked={!!e.estimated} onChange={(x) => set({ estimated: x.target.checked || undefined })} /> Estimated, still to confirm
            </label>
          </div>
        </div>
        <div className="actions" style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" disabled={!valid} onClick={() => { onSave({ ...e, title: e.title.trim() }); onClose(); }}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          {!isNew && onRemove && <button className="btn danger" onClick={() => { onRemove(e.id); onClose(); }}>Remove</button>}
        </div>
      </aside>
    </>
  );
}
