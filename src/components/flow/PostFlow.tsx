import { useEffect, useMemo, useRef, useState } from "react";
import { FORMAT_LABEL } from "../../lib/brand";
import { dayName, shortDate } from "../../lib/dates";
import { isOpen } from "../../lib/planner";
import { applyIdea, rankIdeas } from "../../lib/postSuggest";
import type { MediaLibraryState } from "../../lib/mediaIndex";
import type { Calendar } from "../../lib/useCalendar";
import type { FlowStep, Idea, Slot } from "../../lib/types";
import { CanvaBrowser } from "./CanvaBrowser";
import { BrollStep, MediaStep } from "./MediaStep";
import { MusicStep, PreviewStep, TimeStep, WordsStep } from "./FinishSteps";

export const kindLabel = (s: Pick<Slot, "format">) => (s.format === "post" || s.format === "carousel" ? "grid post" : FORMAT_LABEL[s.format].toLowerCase());
const dateLabel = (s: Slot) => `${dayName(s.date)} ${shortDate(s.date)}`;

const STEP_LABEL: Record<FlowStep, string> = {
  canva: "Canva",
  idea: "Idea",
  heading: "Heading",
  shots: "Shot list",
  media: "Media",
  broll: "B-roll",
  music: "Music",
  words: "Caption",
  time: "Time",
  preview: "Preview",
  done: "Done",
};

export function stepsFor(slot: Slot): FlowStep[] {
  if (slot.canvaDesign) return ["canva", "heading", "music", "words", "time", "preview"];
  return ["canva", "idea", "shots", "media", "broll", "music", "words", "time", "preview"];
}

export interface StepProps {
  slot: Slot;
  cal: Calendar;
  lib: MediaLibraryState;
  save: (patch: Partial<Slot>) => void;
  next: (patch?: Partial<Slot>) => void;
}

/**
 * Making a post, one question at a time: Canva first, then the idea, shot
 * list, media, B-roll, music, words, time and a true-to-life preview.
 */
export function PostFlow({ slot, cal, lib, onClose, onDetails }: { slot: Slot; cal: Calendar; lib: MediaLibraryState; onClose: () => void; onDetails: () => void }) {
  const [draft, setDraft] = useState<Slot>(slot);
  // Typing saves after a short pause, so each key press isn't a save.
  const pending = useRef<Slot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current) void cal.update(pending.current);
    pending.current = null;
  };
  useEffect(() => {
    if (!pending.current) setDraft(slot);
  }, [slot]);
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = stepsFor(draft);
  const step: FlowStep = draft.step && steps.includes(draft.step) ? draft.step : draft.step === "done" ? "preview" : isOpen(draft) ? "canva" : "preview";
  const at = steps.indexOf(step);

  const save = (patch: Partial<Slot>) => {
    setDraft((d) => {
      const n = { ...d, ...patch };
      if (patch.media && n.status === "idea" && n.media.length) n.status = "media";
      pending.current = n;
      return n;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, "step" in patch || "media" in patch ? 0 : 600);
  };
  const go = (s: FlowStep, patch: Partial<Slot> = {}) => save({ ...patch, step: s });
  const next = (patch: Partial<Slot> = {}) => {
    const all = stepsFor({ ...draft, ...patch });
    const i = all.indexOf(step);
    go(all[Math.min(all.length - 1, i + 1)], patch);
  };
  const props: StepProps = { slot: draft, cal, lib, save, next };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="drawer editor flow" role="dialog" aria-modal="true" aria-label={`Make the ${kindLabel(draft)} for ${dateLabel(draft)}`}>
        <header>
          <div style={{ flex: 1 }}>
            <div className="flow-eyebrow">
              <span className={`chip fmt ${draft.format === "post" || draft.format === "carousel" ? "grid" : draft.format}`}>{FORMAT_LABEL[draft.format]}</span> {dateLabel(draft)} · {draft.time}
            </div>
            <h2>{draft.title || `Today's post suggestion is a ${kindLabel(draft)}`}</h2>
          </div>
          <button className="btn small ghost" type="button" onClick={onDetails} title="Every field on one page, the way it was before">
            All details
          </button>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <nav className="flow-steps" aria-label="Steps">
          {steps.map((s, i) => (
            <button key={s} type="button" className={i === at ? "on" : i < at ? "done" : ""} disabled={i > at && isOpen(draft)} onClick={() => go(s)}>
              <span>{i < at ? "✓" : i + 1}</span> {STEP_LABEL[s]}
            </button>
          ))}
        </nav>
        <div className="flow-body">
          {step === "canva" && <CanvaStep {...props} go={go} />}
          {step === "idea" && <IdeaStep {...props} />}
          {step === "heading" && <HeadingStep {...props} />}
          {step === "shots" && <ShotsStep {...props} />}
          {step === "media" && <MediaStep {...props} />}
          {step === "broll" && <BrollStep {...props} />}
          {step === "music" && <MusicStep {...props} />}
          {step === "words" && <WordsStep {...props} />}
          {step === "time" && <TimeStep {...props} />}
          {step === "preview" && <PreviewStep {...props} onClose={onClose} />}
        </div>
        {at > 0 && (
          <div className="flow-back">
            <button type="button" className="btn ghost small" onClick={() => go(steps[at - 1])}>
              ‹ Back to {STEP_LABEL[steps[at - 1]].toLowerCase()}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function CanvaStep({ slot, save, go }: StepProps & { go: (s: FlowStep, patch?: Partial<Slot>) => void }) {
  const [browsing, setBrowsing] = useState(false);
  if (browsing) {
    return (
      <CanvaBrowser
        slot={slot}
        save={save}
        onCancel={() => setBrowsing(false)}
        onPulled={(design, media) => {
          const grid = slot.format === "post" || slot.format === "carousel";
          go("heading", {
            media,
            canvaDesign: { id: design.id, title: design.title, pages: design.pages ?? media.length },
            ideaId: slot.ideaId || `canva:${design.id}`,
            title: slot.title || design.title,
            format: grid ? (media.length > 1 ? "carousel" : "post") : slot.format,
            status: "media",
          });
        }}
      />
    );
  }
  return (
    <div className="flow-card flow-question">
      <p className="flow-lead">
        Today's post suggestion is a <b>{kindLabel(slot)}</b>.
      </p>
      <h3>Do you want to fetch a {kindLabel(slot)} design from Canva?</h3>
      {slot.canvaDesign && <p className="hint">Already pulled in: {slot.canvaDesign.title}.</p>}
      <div className="flow-nav">
        <button type="button" className="btn primary" onClick={() => setBrowsing(true)}>Yes, choose a design</button>
        <button
          type="button"
          className="btn"
          onClick={() => go(slot.ideaId && !slot.canvaDesign ? "shots" : "idea", slot.canvaDesign ? { canvaDesign: undefined, media: [], ideaId: "", title: "" } : {})}
        >
          No, suggest {kindLabel(slot)} ideas
        </button>
      </div>
    </div>
  );
}

const PAGE = 10;

function IdeaStep({ slot, cal, save, next }: StepProps) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(!!slot.ideaId);
  const ranked = useMemo(() => rankIdeas(slot, cal.ideas, cal.slots, asked), [slot.id, slot.date, slot.format, cal.ideas, cal.slots, asked]);
  const pages = Math.max(1, Math.ceil(ranked.length / PAGE));
  const shown = ranked.slice((page % pages) * PAGE, (page % pages) * PAGE + PAGE);
  const matches = asked ? ranked.filter((r) => r.matched).length : 0;

  const choose = (idea: Idea) => {
    save(applyIdea(slot, idea));
    setEditing(true);
  };
  const ownIdea = () => {
    save({ ideaId: `own-${crypto.randomUUID().slice(0, 8)}`, title: query || "", prompt: "", shots: [], caption: "", hashtags: [], cta: "" });
    setEditing(true);
  };

  if (editing && slot.ideaId) {
    return (
      <div className="flow-card">
        <h3>Your idea</h3>
        <p className="hint">Change anything so it sounds like you.</p>
        <div className="field">
          <label htmlFor="f-title">Heading</label>
          <input id="f-title" type="text" value={slot.title} onChange={(e) => save({ title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="f-prompt">What it's about</label>
          <textarea id="f-prompt" style={{ minHeight: 80 }} value={slot.prompt} onChange={(e) => save({ prompt: e.target.value })} />
        </div>
        <div className="chips">
          <span className="chip" title="The kind of content, used to keep each week varied">{slot.pillar}</span>
          {slot.product && <span className="chip">{slot.product}</span>}
        </div>
        <div className="flow-nav">
          <button type="button" className="btn primary" disabled={!slot.title.trim()} onClick={() => next()}>
            Next: shot list
          </button>
          <button type="button" className="btn" onClick={() => setEditing(false)}>Pick a different idea</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-card">
      <h3>{kindLabel(slot)[0].toUpperCase() + kindLabel(slot).slice(1)} ideas for {dateLabel(slot)}</h3>
      <form
        className="idea-ask"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(query.trim());
          setPage(0);
        }}
      >
        <input type="search" placeholder="Ideas about… (for example: summer table, gifting, olive placemats)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn">Suggest</button>
      </form>
      {asked && (
        <p className="hint">
          {matches ? `${matches} idea${matches === 1 ? "" : "s"} about "${asked}" first.` : `Nothing in the idea bank about "${asked}" yet.`}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => save({ askClaude: true, notes: `Suggest 10 new ${kindLabel(slot)} ideas about: ${asked}` })}
            disabled={slot.askClaude}
          >
            {slot.askClaude ? "Claude will add ideas on its next run (about 7 AM, 12 PM or 8 PM)." : "Ask Claude for fresh ideas about this"}
          </button>
        </p>
      )}
      <div className="idea-list">
        {shown.map(({ idea, why, matched }) => (
          <button key={idea.id} type="button" className={`idea-card ${matched ? "match" : ""}`} onClick={() => choose(idea)}>
            <b>{idea.title}</b>
            <span>{idea.prompt}</span>
            <span className="chips">
              <span className="chip">{idea.pillar}</span>
              {idea.product && <span className="chip">{idea.product}</span>}
              {idea.format === "carousel" && <span className="chip">Carousel</span>}
            </span>
            {why.length > 0 && <span className="hint">{why.join(" · ")}</span>}
          </button>
        ))}
      </div>
      <div className="flow-nav">
        {ranked.length > PAGE && (
          <button type="button" className="btn" onClick={() => setPage((p) => p + 1)}>
            Suggest {PAGE} other ideas
          </button>
        )}
        <button type="button" className="btn ghost" onClick={ownIdea}>Write my own idea</button>
      </div>
    </div>
  );
}

/** After a Canva design: just the heading and a line on what it's about. */
function HeadingStep({ slot, save, next }: StepProps) {
  return (
    <div className="flow-card">
      <h3>Name this post</h3>
      <p className="hint">The heading is for the calendar; the caption comes later.</p>
      <div className="field">
        <label htmlFor="f-title">Idea heading</label>
        <input id="f-title" type="text" value={slot.title} onChange={(e) => save({ title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="f-prompt">What it's about (optional, helps the caption and music suggestions)</label>
        <textarea id="f-prompt" style={{ minHeight: 70 }} value={slot.prompt} onChange={(e) => save({ prompt: e.target.value })} />
      </div>
      <div className="flow-nav">
        <button type="button" className="btn primary" disabled={!slot.title.trim()} onClick={() => next()}>
          Next: music
        </button>
      </div>
    </div>
  );
}

function ShotsStep({ slot, save, next }: StepProps) {
  const chosen = new Set(slot.shotsChosen ?? slot.shots.map((_, i) => i));
  const [extra, setExtra] = useState("");
  const toggle = (i: number) => {
    const n = new Set(chosen);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    save({ shotsChosen: [...n].sort((a, b) => a - b) });
  };
  const add = () => {
    if (!extra.trim()) return;
    save({ shots: [...slot.shots, extra.trim()], shotsChosen: [...chosen, slot.shots.length] });
    setExtra("");
  };
  return (
    <div className="flow-card">
      <h3>Shot list</h3>
      <p className="hint">Tick the shots to include. The media suggestions in the next step look for these.</p>
      <ul className="shots big">
        {slot.shots.map((s, i) => (
          <li key={i}>
            <input type="checkbox" id={`fs-${i}`} checked={chosen.has(i)} onChange={() => toggle(i)} />
            <input type="text" aria-label={`Shot ${i + 1}`} value={s} onChange={(e) => save({ shots: slot.shots.map((x, j) => (j === i ? e.target.value : x)) })} />
          </li>
        ))}
      </ul>
      <form
        className="idea-ask"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input type="text" placeholder="Add a shot of your own" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <button type="submit" className="btn">Add</button>
      </form>
      <div className="flow-nav">
        <button type="button" className="btn primary" disabled={!chosen.size && !!slot.shots.length} onClick={() => next()}>
          Next: suggested media
        </button>
      </div>
    </div>
  );
}
