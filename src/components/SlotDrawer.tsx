import { useEffect, useRef, useState, type DragEvent } from "react";
import { FORMAT_LABEL, PILLARS, STATUS_LABEL, STATUS_ORDER } from "../lib/brand";
import { checkMedia } from "../lib/media";
import { addLocalFile, getFile } from "../lib/localMedia";
import type { MediaRef, Music, Slot, Status } from "../lib/types";
import type { Calendar } from "../lib/useCalendar";
import { MediaPicker } from "./MediaPicker";
import { ReelEditor } from "./ReelEditor";
import { PostingPanel } from "./PostingPanel";
import { CanvaPanel } from "./CanvaPanel";
import { BrollPanel } from "./BrollPanel";
import { FitNote, SuggestedMedia } from "./MediaSuggestions";
import { Thumb } from "./Thumb";
import type { MediaLibraryState } from "../lib/mediaIndex";
import { kindOf } from "./Tile";

const CAPTION_LIMIT = 2200;
const HASHTAG_LIMIT = 30;

export function SlotDrawer({ slot, cal, lib, onClose }: { slot: Slot; cal: Calendar; lib: MediaLibraryState; onClose: () => void }) {
  const [draft, setDraft] = useState<Slot>(slot);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [brollPhoto, setBrollPhoto] = useState<MediaRef | null>(null);
  const [choosingVideo, setChoosingVideo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(slot), [slot]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Partial<Slot>) => {
    const next = { ...draft, ...patch };
    if (patch.media && next.status === "idea" && next.media.length) next.status = "media";
    setDraft(next);
    void cal.update(next);
  };

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const refs: MediaRef[] = [];
      for (const f of Array.from(files)) {
        if (f.type.startsWith("image/") || f.type.startsWith("video/")) refs.push(await addLocalFile(f));
      }
      if (refs.length) save({ media: [...draft.media, ...refs] });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const openMedia = async (m: MediaRef) => {
    if (m.source === "drive" && m.link) return window.open(m.link, "_blank", "noopener");
    const blob = await getFile(m.id);
    if (blob) window.open(URL.createObjectURL(blob), "_blank", "noopener");
    else alert("The original file is on the device it was added from.");
  };

  const fullCaption = [draft.caption, draft.cta, draft.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const copyCaption = async () => {
    await navigator.clipboard.writeText(fullCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shuffle = async () => {
    const next = await cal.shuffle(draft.id);
    if (next) setDraft(next);
  };

  const undoClaude = async () => {
    const next = await cal.undoClaude(draft.id);
    if (next) setDraft(next);
  };

  const postPhotos = draft.media.filter((m) => m.mimeType.startsWith("image/"));
  const startVideo = (m: MediaRef) => {
    setChoosingVideo(false);
    setBrollPhoto(m);
  };

  const k = kindOf(draft);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer editor" role="dialog" aria-modal="true" aria-label={draft.title}>
        <header>
          <div style={{ flex: 1 }}>
            <h2>{draft.title}</h2>
            <div className="chips">
              <span className={`chip fmt ${k}`}>{FORMAT_LABEL[draft.format]}</span>
              <span className="chip">{draft.pillar}</span>
              {draft.product && <span className="chip">{draft.product}</span>}
            </div>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {draft.claude && (
          <div className="claude-note" role="note">
            <div className="label">✦ Claude, {new Date(draft.claude.at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <p>{draft.claude.note}</p>
            <div className="actions">
              {draft.claude.previous && Object.keys(draft.claude.previous).length > 0 && (
                <button className="btn small" type="button" onClick={undoClaude}>Undo Claude's changes</button>
              )}
              <button className="btn small ghost" type="button" onClick={() => save({ claude: undefined })}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="editor-cols">
        <div className="editor-main">
        <div className="field">
          <div className="label">The idea</div>
          <div className="prompt">{draft.prompt}</div>
        </div>

        <div className="field">
          <div className="label">Shot list</div>
          <ul className="shots">
            {draft.shots.map((s, i) => (
              <li key={i}>
                <input type="checkbox" id={`shot-${i}`} />
                <label htmlFor={`shot-${i}`}>{s}</label>
              </li>
            ))}
          </ul>
        </div>

        <div className="field">
          <div className="label">Photos and videos</div>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            {busy ? "Adding…" : (
              <>
                Drop files here, or{" "}
                <button className="btn small" type="button" onClick={() => setPicking(true)}>Choose from Drive</button>{" "}
                <button className="btn small" type="button" onClick={() => fileInput.current?.click()}>Upload</button>
              </>
            )}
            <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {k === "grid" ? "Grid: portrait 4:5 works best." : "Vertical 9:16 for reels and stories."}
            </div>
          </div>
          {draft.media.length > 0 && (
            <div className="media-list">
              {draft.media.map((m) => {
                const check = m.width && m.height ? checkMedia(draft.format, m.width, m.height, m.durationSec) : null;
                return (
                  <div className="media-item" key={m.id}>
                    <button type="button" className="img" style={{ border: 0, width: "100%", padding: 0 }} onClick={() => openMedia(m)}>
                      <Thumb media={m} className="mthumb fill" />
                    </button>
                    <div className="meta">
                      <div title={m.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                      {check && <div className={check.ok ? "ok" : "bad"}>{check.message}</div>}
                      {m.source === "local" && <div style={{ color: "var(--muted)" }}>Original on this device</div>}
                      <FitNote media={m} slot={draft} all={cal.slots} lib={lib} />
                      {m.mimeType.startsWith("image/") && (
                        <button type="button" className="rm broll-btn" onClick={() => startVideo(m)} title="Turn this photo into short, natural video clips">
                          🎬 Create video
                        </button>
                      )}
                      <button type="button" className="rm" onClick={() => save({ media: draft.media.filter((x) => x.id !== m.id) })}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="video-bar">
            <button type="button" className="btn primary" onClick={() => (postPhotos.length === 1 ? startVideo(postPhotos[0]) : setChoosingVideo((v) => !v))}>
              🎬 Create video from a photo
            </button>
            <span className="hint">Turns one photo into short, natural-looking clips for reels and stories.</span>
          </div>
          {choosingVideo && (
            <div className="broll">
              <b>Which photo?</b>
              {postPhotos.length ? (
                <div className="video-pick">
                  {postPhotos.map((m) => (
                    <button key={m.id} type="button" onClick={() => startVideo(m)} title={m.name}>
                      <Thumb media={m} className="mthumb" />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="hint">
                {postPhotos.length ? "Or use " : "Add a photo to this post first, or use "}
                <b>🎬 Create video</b> on any suggested photo below.
              </div>
            </div>
          )}
          {brollPhoto && <BrollPanel key={brollPhoto.id} slot={draft} photo={brollPhoto} save={save} onClose={() => setBrollPhoto(null)} />}
          <SuggestedMedia
            onVideo={startVideo}
            slot={draft}
            all={cal.slots}
            lib={lib}
            onAdd={(m) => {
              const { path: _p, ...ref } = m as MediaRef & { path?: string };
              save({ media: [...draft.media, ref] });
            }}
          />
        </div>

        {draft.brandCheck && (
          <div className={`banner ${draft.brandCheck.ok ? "" : "warn"}`} style={{ marginTop: -6 }}>
            <b>Claude's brand check</b>
            {draft.brandCheck.mediaIds.join() !== draft.media.map((m) => m.id).join() && (
              <span className="hint"> (from before the media changed; it runs again on the next check)</span>
            )}
            {draft.brandCheck.ok && !draft.brandCheck.notes.length ? (
              <div>Fonts, text and colours all look on brand.</div>
            ) : (
              <ul className="fit-reasons">
                {draft.brandCheck.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="field">
          <div className="label">Canva</div>
          <CanvaPanel slot={draft} save={save} />
        </div>

        {draft.format === "reel" && (
          <div className="field">
            <div className="label">Reel editor</div>
            <ReelEditor slot={draft} save={save} />
          </div>
        )}

        </div>
        <div className="editor-side">
        <div className="field">
          <label htmlFor="caption">Caption</label>
          <textarea id="caption" value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} onBlur={() => save({ caption: draft.caption })} />
          <div className={`counter ${fullCaption.length > CAPTION_LIMIT ? "over" : ""}`}>{fullCaption.length} / {CAPTION_LIMIT} with CTA and hashtags</div>
        </div>
        <div className="field">
          <label htmlFor="cta">Call to action</label>
          <input id="cta" type="text" value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} onBlur={() => save({ cta: draft.cta })} />
        </div>
        <div className="field">
          <label htmlFor="tags">Hashtags</label>
          <input
            id="tags"
            type="text"
            value={draft.hashtags.join(" ")}
            onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
            onBlur={() => save({ hashtags: draft.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)) })}
          />
          <div className={`counter ${draft.hashtags.length > HASHTAG_LIMIT ? "over" : ""}`}>{draft.hashtags.length} / {HASHTAG_LIMIT}</div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={draft.date} onChange={(e) => e.target.value && save({ date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="time">Time</label>
            <input id="time" type="time" value={draft.time} onChange={(e) => save({ time: e.target.value })} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" value={draft.status} onChange={(e) => save({ status: e.target.value as Status })}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pillar">Pillar</label>
            <select id="pillar" value={draft.pillar} onChange={(e) => save({ pillar: e.target.value as Slot["pillar"] })}>
              {PILLARS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {draft.format === "reel" && (
          <div className="field">
            <label htmlFor="music">Music</label>
            <select id="music" value={draft.music} onChange={(e) => save({ music: e.target.value as Music })}>
              <option value="royalty-free">Royalty-free track baked in (auto-posts)</option>
              <option value="instagram">Instagram music (I'll post it by hand)</option>
              <option value="none">No music</option>
            </select>
          </div>
        )}

        {(["approved", "scheduled", "posted"].includes(draft.status) || draft.publish) && (
          <div className="field">
            <div className="label">Posting</div>
            <PostingPanel slot={draft} save={save} />
          </div>
        )}

        <div className="field">
          <label className="toggle" htmlFor="ask">
            <input id="ask" type="checkbox" checked={draft.askClaude} onChange={(e) => save({ askClaude: e.target.checked })} />
            Ask Claude to help with this one
          </label>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Claude checks at about 7 AM, 12 PM and 8 PM. Say what you want in the notes, for example "make the caption shorter" or "write this around the new olive placemats". With no notes, Claude rewrites the caption, hashtags and call to action.
          </div>
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" style={{ minHeight: 70 }} placeholder={draft.askClaude ? "What should Claude do?" : ""} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => save({ notes: draft.notes })} />
        </div>

        </div>
        </div>

        <div className="actions">
          <button className="btn primary" type="button" onClick={copyCaption}>{copied ? "Copied" : "Copy caption"}</button>
          <button className="btn" type="button" onClick={shuffle} disabled={draft.locked}>Give me another idea</button>
          <button className="btn" type="button" onClick={() => save({ locked: !draft.locked })}>{draft.locked ? "Unlock" : "Lock this idea"}</button>
          <span className="spacer" />
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              if (confirm("Remove this slot from the calendar?")) {
                void cal.remove(draft.id);
                onClose();
              }
            }}
          >
            Remove slot
          </button>
        </div>
      </aside>
      {picking && (
        <MediaPicker
          lib={lib}
          onClose={() => setPicking(false)}
          onPick={(items) => {
            setPicking(false);
            save({ media: [...draft.media, ...items.filter((i) => !draft.media.some((m) => m.id === i.id))] });
          }}
        />
      )}
    </>
  );
}
