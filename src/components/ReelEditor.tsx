import { useEffect, useMemo, useRef, useState } from "react";
import { autoStoryboard, cleanStoryboard, isImage, isVideo, totalSeconds } from "../lib/reel";
import type { Progress } from "../lib/render";
import type { MediaRef, ReelShot, Slot, Storyboard } from "../lib/types";
import { Thumb } from "./Thumb";

const fmtS = (n: number) => `${Math.round(n * 10) / 10} s`;

/**
 * Turns a reel slot's clips and photos into a finished 9:16 reel: a storyboard
 * you can read and change, then a render in this browser.
 */
export function ReelEditor({ slot, save }: { slot: Slot; save: (patch: Partial<Slot>) => void }) {
  const media = useMemo(() => slot.media.filter((m) => isVideo(m) || isImage(m)), [slot.media]);
  const sb = useMemo(() => (slot.storyboard ? cleanStoryboard(slot.storyboard, media) : null), [slot.storyboard, media]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; seconds: number } | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const byId = useMemo(() => Object.fromEntries(media.map((m) => [m.id, m])), [media]);
  const setSb = (next: Storyboard) => save({ storyboard: next });
  const setShot = (i: number, patch: Partial<ReelShot>) =>
    sb && setSb({ ...sb, by: "person", shots: sb.shots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveShot = (i: number, d: -1 | 1) => {
    if (!sb) return;
    const shots = [...sb.shots];
    const j = i + d;
    if (j < 0 || j >= shots.length) return;
    [shots[i], shots[j]] = [shots[j], shots[i]];
    setSb({ ...sb, by: "person", shots });
  };

  if (!media.length) {
    return <p className="hint-text">Add clips or photos above, then build the reel here.</p>;
  }

  const makeAuto = () => save({ storyboard: autoStoryboard(media, slot.title) });
  const unused = sb ? media.filter((m) => !sb.shots.some((s) => s.mediaId === m.id)) : [];
  const wantsMusic = slot.music === "royalty-free";

  const render = async () => {
    if (!sb) return;
    setError(null);
    setResult(null);
    try {
      const { renderReel } = await import("../lib/render");
      let track: Blob | null = wantsMusic ? music : null;
      let credit: string | undefined;
      if (wantsMusic && !track && slot.song?.source === "library" && slot.song.driveId) {
        const { downloadFile } = await import("../lib/drive");
        track = await downloadFile(slot.song.driveId);
        credit = slot.song.credit;
      }
      const out = await renderReel(sb, media, track, setProgress, credit);
      setResult({ url: URL.createObjectURL(out.video), blob: out.video, seconds: out.seconds });
      if (slot.status === "idea" || slot.status === "media") save({ status: "editing" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const fileName = `${slot.date} ${slot.title}`.replace(/[^\w\- ]+/g, "").trim() + ".mp4";

  const saveToDrive = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const { saveReel } = await import("../lib/drive");
      const saved = await saveReel(fileName, result.blob);
      save({
        render: { at: new Date().toISOString(), seconds: result.seconds, name: fileName, driveId: saved.id, link: saved.link },
        status: slot.status === "editing" || slot.status === "media" || slot.status === "idea" ? "review" : slot.status,
      });
    } catch (e) {
      setError(`Couldn't save to Drive: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="reel-editor">
      {!sb ? (
        <div className="row" style={{ alignItems: "center" }}>
          <button className="btn primary" type="button" onClick={makeAuto}>Build a storyboard</button>
          <span className="hint-text">Or tick "Ask Claude" below and Claude will plan the cut on its next run.</span>
        </div>
      ) : (
        <>
          <div className="sb-head">
            <span>{sb.shots.length} shots · {fmtS(totalSeconds(sb))}{sb.by === "claude" ? " · planned by Claude" : ""}</span>
            <span className="spacer" />
            <button className="btn small ghost" type="button" onClick={makeAuto}>Start again</button>
          </div>
          <ol className="storyboard">
            {sb.shots.map((s, i) => {
              const m = byId[s.mediaId] as MediaRef | undefined;
              if (!m) return null;
              const video = isVideo(m);
              return (
                <li key={`${s.mediaId}-${i}`} className="shot">
                  <Thumb media={m} className="thumb mthumb" />
                  <div className="shot-body">
                    <div className="shot-name" title={m.name}>{i + 1}. {m.name}</div>
                    <div className="shot-fields">
                      {video && (
                        <label>From <input type="number" min={0} step={0.5} value={s.start} onChange={(e) => setShot(i, { start: Number(e.target.value) })} /> s</label>
                      )}
                      <label>Length <input type="number" min={0.5} max={15} step={0.5} value={s.duration} onChange={(e) => setShot(i, { duration: Number(e.target.value) })} /> s</label>
                      {video && (
                        <label>Speed <select value={s.speed} onChange={(e) => setShot(i, { speed: Number(e.target.value) })}>
                          <option value={1}>Normal</option>
                          <option value={0.75}>Slow</option>
                          <option value={0.5}>Slower</option>
                          <option value={1.5}>Faster</option>
                        </select></label>
                      )}
                    </div>
                    <input type="text" className="shot-text" placeholder="Words on screen (optional)" value={s.text ?? ""} maxLength={60} onChange={(e) => setShot(i, { text: e.target.value })} />
                  </div>
                  <div className="shot-tools">
                    <button type="button" className="btn small ghost" aria-label="Move up" onClick={() => moveShot(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn small ghost" aria-label="Move down" onClick={() => moveShot(i, 1)} disabled={i === sb.shots.length - 1}>↓</button>
                    <button type="button" className="btn small ghost" aria-label="Remove shot" onClick={() => setSb({ ...sb, by: "person", shots: sb.shots.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                </li>
              );
            })}
          </ol>
          {unused.length > 0 && (
            <div className="hint-text">
              Not in the cut:{" "}
              {unused.map((m) => (
                <button key={m.id} type="button" className="btn small" style={{ margin: "2px 4px 2px 0" }}
                  onClick={() => setSb({ ...sb, by: "person", shots: [...sb.shots, { mediaId: m.id, start: 0, duration: 2.5, speed: 1 }] })}>
                  + {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <label className="toggle"><input type="checkbox" checked={sb.endCard} onChange={(e) => setSb({ ...sb, by: "person", endCard: e.target.checked })} /> Roopip end card</label>
            <label className="toggle"><input type="checkbox" checked={sb.grade === "warm"} onChange={(e) => setSb({ ...sb, by: "person", grade: e.target.checked ? "warm" : "natural" })} /> Warm colour grade</label>
          </div>
          {wantsMusic && (
            <div className="hint-text">
              Music: {music ? <b>{music.name}</b> : slot.song?.source === "library" ? <b>{slot.song.title}</b> : "none chosen, so the reel will be silent"}.{" "}
              <button type="button" className="btn small" onClick={() => musicInput.current?.click()}>{music ? "Change" : "Choose a track"}</button>{" "}
              Use a track cleared for commercial use, such as one from Pixabay Music.
              <input ref={musicInput} type="file" accept="audio/*" hidden onChange={(e) => setMusic(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {slot.music === "instagram" && <div className="hint-text">Exports silent. Add a trending sound in Instagram when you post it by hand.</div>}

          <div className="row" style={{ alignItems: "center" }}>
            <button className="btn primary" type="button" onClick={render} disabled={!!progress || !sb.shots.length}>
              {result ? "Render again" : "Render reel"}
            </button>
            {progress && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
                <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
                <span>{progress.label}</span>
              </div>
            )}
          </div>
          {!progress && !result && <div className="hint-text">Rendering happens in this browser. A laptop works best; a 20-second reel takes a minute or two.</div>}
        </>
      )}

      {error && <div className="error-text">{error}</div>}

      {result && (
        <div className="reel-result">
          <video src={result.url} controls playsInline />
          <div className="actions" style={{ border: 0, marginTop: 8, paddingTop: 0 }}>
            <a className="btn" href={result.url} download={fileName}>Download</a>
            <button className="btn primary" type="button" onClick={saveToDrive} disabled={saving}>{saving ? "Saving…" : "Save to Drive and send for approval"}</button>
          </div>
        </div>
      )}
      {slot.render && !result && (
        <div className="hint-text">
          Last render: <a href={slot.render.link} target="_blank" rel="noopener">{slot.render.name}</a> ({fmtS(slot.render.seconds)}), saved {new Date(slot.render.at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}.
        </div>
      )}
    </div>
  );
}
