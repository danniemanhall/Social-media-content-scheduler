import { useMemo } from "react";
import { PHASE_LABEL, type BrandEvent } from "../lib/events";
import { GRID_RULES } from "../lib/playbook";
import { suggestIdeas } from "../lib/suggest";
import type { Idea, Slot } from "../lib/types";

/**
 * What the brain says about this post's day: the doc's theme for the week,
 * events and sales coming up, deal deadlines, and a few event ideas to use.
 */
export function EventBrief({ slot, events, bank, onUse }: { slot: Slot; events: BrandEvent[]; bank: Idea[]; onUse: (i: Idea) => void }) {
  const formats = slot.format === "post" || slot.format === "carousel" ? (["post", "carousel"] as const) : [slot.format];
  const out = useMemo(
    () => suggestIdeas({ date: slot.date, formats: [...formats], bank, events, count: 6, exclude: [slot.ideaId] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot.date, slot.format, slot.ideaId, bank, events],
  );
  const eventIdeas = out.ideas.filter((i) => i.eventId).slice(0, 3);
  const rule = GRID_RULES[Math.abs(hash(slot.id)) % GRID_RULES.length];
  return (
    <div className="event-brief" role="note">
      <div className="label">This week: {out.theme.name}</div>
      <p>{out.theme.focus}</p>
      {out.tasks.map((t) => <p key={t} className="ym-task">⚑ {t}</p>)}
      {out.moments.filter((m) => m.phase !== "submit").slice(0, 2).map((m) => (
        <p key={m.event.id + m.phase}>
          <span className={`ym-swatch ev-${m.event.kind}`} /> <b>{m.event.title}</b> · {PHASE_LABEL[m.phase]}
          {m.daysToStart > 0 && ` (in ${m.daysToStart} day${m.daysToStart === 1 ? "" : "s"})`}
        </p>
      ))}
      {eventIdeas.length > 0 && (
        <div className="brief-ideas">
          {eventIdeas.map((i) => (
            <button key={i.id} type="button" className="btn small" onClick={() => onUse(i)} title={i.prompt}>Use: {i.title}</button>
          ))}
        </div>
      )}
      <p className="hint-text"><b>{rule.title}:</b> {rule.rule}</p>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}
