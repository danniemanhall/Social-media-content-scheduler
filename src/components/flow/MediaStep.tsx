import { useMemo, useRef, useState } from "react";
import { lastUsedMap, suggestMedia, type IndexedMedia } from "../../lib/brandFit";
import { brollPlan, BROLL_VIDEO_SHOT, brollVideoName } from "../../lib/broll";
import { addLocalFile } from "../../lib/localMedia";
import { isImage, isVideo } from "../../lib/reel";
import type { Progress } from "../../lib/render";
import type { MediaRef, Slot } from "../../lib/types";
import { FitNote } from "../MediaSuggestions";
import { MediaPicker } from "../MediaPicker";
import { Thumb } from "../Thumb";
import { useImageUrl, useVideoUrl } from "./useMediaUrl";
import type { StepProps } from "./PostFlow";

const PAGE = 8;
const strip = (m: IndexedMedia): MediaRef => {
  const { path: _p, ...ref } = m;
  return ref;
};

/** Instagram's size for the post: stories and reels 9:16, grid posts 4:5. */
export function sizeOf(format: Slot["format"]) {
  return format === "story" || format === "reel" ? { w: 1080, h: 1920, label: "9:16" } : { w: 1080, h: 1350, label: "4:5" };
}

/** The ticked shots only, so suggestions look for what will actually be used. */
export function chosenShots(slot: Slot) {
  return slot.shotsChosen ? slot.shots.filter((_, i) => slot.shotsChosen!.includes(i)) : slot.shots;
}

/** One chosen file, shown cropped and centred to the post's size. */
function Cropped({ media, format }: { media: MediaRef; format: Slot["format"] }) {
  const url = useImageUrl(media);
  const size = sizeOf(format);
  return (
    <div className="cropped" style={{ aspectRatio: `${size.w} / ${size.h}`, backgroundImage: url ? `url("${url}")` : undefined }}>
      {!url && <span className="hint">{media.name}</span>}
      {isVideo(media) && <span className="thumb-play">▶</span>}
    </div>
  );
}

function cropNote(m: MediaRef, format: Slot["format"]) {
  const size = sizeOf(format);
  if (!m.width || !m.height) return `Cropped and centred to ${size.label}`;
  const want = size.w / size.h;
  const r = m.width / m.height;
  if (Math.abs(r - want) / want < 0.03) return `Already ${size.label}, no crop needed`;
  return `${r > want ? "Sides" : "Top and bottom"} trimmed to centre it at ${size.label} (${size.w}×${size.h})`;
}

export function MediaStep({ slot, cal, lib, save, next }: StepProps) {
  const [page, setPage] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const grid = slot.format === "post" || slot.format === "carousel";

  const ranked = useMemo(() => {
    if (!lib.index?.items.length) return [];
    const forShots = { ...slot, shots: chosenShots(slot), media: [] };
    return suggestMedia(forShots, lib.index.items, lib.looks, lastUsedMap(cal.slots, slot.id), slot.date, 64, lib.tags);
    // Rank once per idea and shot choice, so picking a photo doesn't reshuffle the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.index, lib.tags, slot.ideaId, slot.title, slot.shotsChosen?.join(), slot.shots.join("|")]);
  const pages = Math.max(1, Math.ceil(ranked.length / PAGE));
  const shown = ranked.slice((page % pages) * PAGE, (page % pages) * PAGE + PAGE);

  const setMedia = (media: MediaRef[]) => {
    // A grid post with more than one photo becomes a carousel, and back.
    const format = grid ? (media.length > 1 ? "carousel" : "post") : slot.format;
    save({ media, format });
  };
  const has = (id: string) => slot.media.some((m) => m.id === id);
  const toggle = (m: MediaRef) => setMedia(has(m.id) ? slot.media.filter((x) => x.id !== m.id) : [...slot.media, m]);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= slot.media.length) return;
    const a = [...slot.media];
    [a[i], a[j]] = [a[j], a[i]];
    setMedia(a);
  };
  const upload = async (files: FileList) => {
    setBusy(true);
    try {
      const refs: MediaRef[] = [];
      for (const f of Array.from(files)) if (f.type.startsWith("image/") || f.type.startsWith("video/")) refs.push(await addLocalFile(f));
      setMedia([...slot.media, ...refs]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flow-card">
      <h3>Suggested media</h3>
      <p className="hint">
        Picked for {chosenShots(slot).length ? `the shots you ticked` : "the idea"}. Tap to use one; {slot.format === "story" ? "each photo is one story frame" : grid ? "more than one makes a carousel" : "photos become shots in the reel"}.
      </p>
      {!lib.index ? (
        <p className="hint">Suggestions appear once the media folders have been scanned (Media tab, Scan folders).</p>
      ) : (
        <div className="suggest-row">
          {shown.map((s) => (
            <button key={s.media.id} type="button" className={`suggest-item pick ${has(s.media.id) ? "on" : ""}`} onClick={() => toggle(strip(s.media))} aria-pressed={has(s.media.id)}>
              <Thumb media={s.media} className="img" />
              <span className="name">{s.media.name.replace(/\.[a-z0-9]+$/i, "")}</span>
              {s.text && <span className="seen">{s.text}</span>}
              <span className="why">{s.why.join(" · ")}</span>
              <span className="tick">{has(s.media.id) ? "✓ Using" : "Use"}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flow-nav">
        {ranked.length > PAGE && (
          <button type="button" className="btn" onClick={() => setPage((p) => p + 1)}>
            Suggest different media
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => setPicking(true)}>Choose from Drive</button>
        <button type="button" className="btn ghost" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? "Adding…" : "Upload"}</button>
        <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>

      {slot.media.length > 0 && (
        <>
          <h3 style={{ marginTop: 22 }}>Your {slot.format === "story" ? "story frames" : "post"}</h3>
          <div className="chosen-row">
            {slot.media.map((m, i) => (
              <div key={m.id} className="chosen">
                <Cropped media={m} format={slot.format} />
                <div className="hint">{cropNote(m, slot.format)}</div>
                <FitNote media={m} slot={slot} all={cal.slots} lib={lib} />
                <div className="row-btns">
                  {slot.media.length > 1 && (
                    <>
                      <button type="button" className="btn small ghost" onClick={() => move(i, -1)} disabled={!i} aria-label="Move earlier">‹</button>
                      <button type="button" className="btn small ghost" onClick={() => move(i, 1)} disabled={i === slot.media.length - 1} aria-label="Move later">›</button>
                    </>
                  )}
                  <button type="button" className="btn small ghost" onClick={() => toggle(m)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flow-nav">
        <button type="button" className="btn primary" disabled={!slot.media.length} onClick={() => next()}>
          Next: B-roll
        </button>
      </div>
      {picking && (
        <MediaPicker
          lib={lib}
          onClose={() => setPicking(false)}
          onPick={(items) => {
            setPicking(false);
            setMedia([...slot.media, ...items.filter((i) => !has(i.id))]);
          }}
        />
      )}
    </div>
  );
}

/**
 * Optional: turn the chosen photos into one B-roll video, preview it, then
 * use it or keep the photos.
 */
export function BrollStep({ slot, save, next }: StepProps) {
  const photos = (slot.stillMedia ?? slot.media).filter(isImage);
  const usingBroll = !!slot.stillMedia;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const current = usingBroll ? slot.media.find(isVideo) : undefined;
  const [watch, setWatch] = useState(false);
  const video = useVideoUrl(current, watch);

  const make = async () => {
    setError(null);
    try {
      const { renderBrollVideo } = await import("../../lib/render");
      const plan = brollPlan(photos);
      const blob = await renderBrollVideo(plan, setProgress);
      setMade({ blob, url: URL.createObjectURL(blob), seconds: Math.round(plan.length * BROLL_VIDEO_SHOT) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const use = async () => {
    if (!made) return;
    setSaving(true);
    setError(null);
    try {
      const { BROLL_FOLDER, connectDrive, saveToAppFolder } = await import("../../lib/drive");
      await connectDrive();
      const { isFolder: _f, ...ref } = await saveToAppFolder(BROLL_FOLDER, brollVideoName(slot.title), made.blob, "video/mp4");
      const still = slot.stillMedia ?? slot.media;
      const vid: MediaRef = { ...ref, width: ref.width ?? 1080, height: ref.height ?? 1920, durationSec: ref.durationSec ?? made.seconds };
      // A grid post with a video goes out as a single video post.
      next({ media: [vid], stillMedia: still, format: slot.format === "carousel" ? "post" : slot.format, song: slot.song ? { ...slot.song, bakedInto: undefined } : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const keepPhotos = () => next({ media: slot.stillMedia ?? slot.media, stillMedia: undefined, format: slot.format === "post" && (slot.stillMedia?.length ?? 0) > 1 ? "carousel" : slot.format });

  return (
    <div className="flow-card">
      <h3>B-roll</h3>
      {usingBroll ? (
        <>
          <p>This post uses a B-roll video made from {photos.length} photo{photos.length === 1 ? "" : "s"}.</p>
          {video.url ? <video className="broll-preview" src={video.url} controls autoPlay muted playsInline /> : (
            <button type="button" className="btn" onClick={() => setWatch(true)} disabled={video.loading}>{video.loading ? "Loading…" : "Watch it"}</button>
          )}
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={() => next()}>Keep the B-roll video</button>
            <button type="button" className="btn" onClick={keepPhotos}>Rather keep the photos</button>
          </div>
        </>
      ) : !photos.length ? (
        <>
          <p className="hint">B-roll is made from photos, and this post has none.</p>
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={() => next()}>Next: music</button>
          </div>
        </>
      ) : made ? (
        <>
          <p>Here's the {made.seconds}-second B-roll. Use it, or keep the photos as they are.</p>
          <video className="broll-preview" src={made.url} controls autoPlay muted loop playsInline />
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={use} disabled={saving}>{saving ? "Saving to Drive…" : "Use the B-roll video"}</button>
            <button type="button" className="btn" onClick={() => next()} disabled={saving}>Rather keep the photos</button>
          </div>
        </>
      ) : (
        <>
          <p>
            Make a short B-roll video from the {photos.length} photo{photos.length === 1 ? "" : "s"} you chose? Each one gets a slow, handheld-style camera move, cut together.
            {slot.format === "reel" ? " A reel needs video, so this is the quickest way to one." : ""}
          </p>
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={make} disabled={!!progress}>Make a B-roll video</button>
            <button type="button" className="btn" onClick={() => next()} disabled={!!progress}>No thanks, keep the photos</button>
          </div>
          {progress && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
              <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
              <span>{progress.label}</span>
            </div>
          )}
        </>
      )}
      {error && <div className="bad">{error}</div>}
    </div>
  );
}
