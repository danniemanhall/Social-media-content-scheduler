import { useEffect, useMemo, useRef, useState } from "react";
import { suggestTime } from "../../lib/bestTime";
import { isVideo } from "../../lib/reel";
import type { Progress } from "../../lib/render";
import { captionOptions, ctaOptions, hashtagOptions, HASHTAG_LIMIT, moodsFor, pixabayUrl, rankTracks } from "../../lib/postSuggest";
import type { Track } from "../../lib/drive";
import { creditFromName, creditOf, downloadFreeTrack, fileNameOf, lengthOf, licenseLabel, searchFreeMusic, type FreeTrack } from "../../lib/freeMusic";
import type { MediaRef } from "../../lib/types";
import { GridPreview } from "../GridPreview";
import { PostingPanel } from "../PostingPanel";
import { ReelEditor } from "../ReelEditor";
import { framesOf, InstagramPreview } from "./InstagramPreview";
import type { StepProps } from "./PostFlow";

const CAPTION_LIMIT = 2200;

export function MusicStep({ slot, save, next }: StepProps) {
  const moods = moodsFor(slot);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [igSong, setIgSong] = useState(slot.song?.source === "instagram" ? slot.song.title : "");
  const [progress, setProgress] = useState<Progress | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const frames = framesOf(slot);
  const video = frames.find(isVideo);
  const reelToRender = slot.format === "reel" && !slot.render && !(slot.media.length === 1 && video);

  const load = async () => {
    setError(null);
    try {
      const { connectDrive, listMusic } = await import("../../lib/drive");
      await connectDrive();
      setTracks(await listMusic());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => void load(), []);
  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url); }, [playing]);

  const ranked = useMemo(() => (tracks ? rankTracks(tracks, moods) : []), [tracks, moods]);

  const preview = async (t: Track) => {
    if (playing?.id === t.id) return setPlaying(null);
    const { downloadFile } = await import("../../lib/drive");
    setPlaying({ id: t.id, url: URL.createObjectURL(await downloadFile(t.id)) });
  };

  const songTitle = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/ \((CC0|CC BY[^)]*)\)$/i, "");
  const choose = (t: Track) =>
    save({ song: { title: songTitle(t.name), source: "library", driveId: t.id, credit: creditFromName(t.name) }, music: "royalty-free" });

  // Free music library (Openverse / Jamendo, CC0 and CC BY only).
  const [freeQuery, setFreeQuery] = useState(moods[0]?.free ?? "instrumental");
  const [free, setFree] = useState<{ query: string; page: number; tracks: FreeTrack[]; more: boolean } | null>(null);
  const [freeBusy, setFreeBusy] = useState<string | null>(null);
  const [freeError, setFreeError] = useState<string | null>(null);
  const searchFree = async (query: string, page = 1) => {
    setFreeQuery(query);
    setFreeError(null);
    setFreeBusy("search");
    try {
      const r = await searchFreeMusic(query, page);
      setFree((f) => ({ query, page, more: r.more, tracks: page > 1 && f ? [...f.tracks, ...r.tracks.filter((t) => !f.tracks.some((x) => x.id === t.id))] : r.tracks }));
    } catch (e) {
      setFreeError(e instanceof Error ? e.message : String(e));
    } finally {
      setFreeBusy(null);
    }
  };
  useEffect(() => void searchFree(freeQuery), []);
  const useFree = async (t: FreeTrack) => {
    setFreeError(null);
    setFreeBusy(t.id);
    try {
      const { saveTrack } = await import("../../lib/drive");
      const name = fileNameOf(t);
      const existing = tracks?.find((x) => x.name === name);
      const saved = existing ?? (await saveTrack(new File([await downloadFreeTrack(t)], name, { type: "audio/mpeg" })));
      if (!existing) setTracks((ts) => [...(ts ?? []), saved]);
      save({ song: { title: `${t.title} by ${t.creator}`, source: "library", driveId: saved.id, credit: creditOf(t), link: t.page }, music: "royalty-free" });
    } catch (e) {
      setFreeError(e instanceof Error ? e.message : String(e));
    } finally {
      setFreeBusy(null);
    }
  };

  const bake = async () => {
    if (!video || !slot.song?.driveId) return;
    setError(null);
    try {
      const { addMusic } = await import("../../lib/render");
      const { downloadFile, saveToAppFolder, BROLL_FOLDER } = await import("../../lib/drive");
      const track = await downloadFile(slot.song.driveId);
      const out = await addMusic(video, track, setProgress);
      setProgress({ value: 1, label: "Saving to Drive…" });
      const name = `${slot.date} ${slot.title.slice(0, 40)} with music.mp4`.replace(/[\\/:*?"<>|]/g, "-");
      const { isFolder: _f, ...ref } = await saveToAppFolder(BROLL_FOLDER, name, out, "video/mp4");
      const withMusic: MediaRef = { ...ref, width: video.width ?? 1080, height: video.height ?? 1920, durationSec: video.durationSec };
      if (slot.render?.driveId === video.id) save({ render: { ...slot.render, driveId: ref.id, link: ref.link, name }, song: { ...slot.song, bakedInto: ref.id } });
      else save({ media: slot.media.map((m) => (m.id === video.id ? withMusic : m)), song: { ...slot.song, bakedInto: ref.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const addTrack = async (f: File) => {
    try {
      const { saveTrack } = await import("../../lib/drive");
      const t = await saveTrack(f);
      setTracks((ts) => [...(ts ?? []), t]);
      choose(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const lib = slot.song?.source === "library";
  return (
    <div className="flow-card">
      <h3>Music</h3>
      <p className="hint">
        Suggested for a {slot.pillar.toLowerCase()} {slot.format === "story" ? "story" : slot.format === "reel" ? "reel" : "post"}: {moods.map((m) => m.label.toLowerCase()).join(", ")}. Calm and warm, to suit Roopip.
      </p>

      <div className="free-music">
        <h4>Free music to choose from</h4>
        <p className="hint">Instrumental tracks from Jamendo that may be used commercially (CC0 or CC BY). Press ▶ to listen. "Use this" saves the track to the "Roopip music" folder in Drive. Where the licence asks for a credit, the app adds it to the caption.</p>
        <div className="chips">
          {moods.map((m) => (
            <button key={m.label} type="button" className={`chip tag ${free?.query === m.free ? "on" : ""}`} onClick={() => searchFree(m.free)}>
              {m.label}
            </button>
          ))}
        </div>
        <form className="idea-ask" onSubmit={(e) => (e.preventDefault(), searchFree(freeQuery))}>
          <input type="search" aria-label="Search free music" placeholder="Search, e.g. piano, guitar, jazz, ambient" value={freeQuery} onChange={(e) => setFreeQuery(e.target.value)} />
          <button type="submit" className="btn" disabled={freeBusy === "search"}>Search</button>
        </form>
        <div className="music-list">
          {freeBusy === "search" && !free && <p className="hint">Finding music…</p>}
          {free && free.tracks.length === 0 && freeBusy !== "search" && <p className="hint">Nothing suitable for "{free.query}". Try one simple word, like piano or guitar.</p>}
          {free?.tracks.map((t) => {
            const chosen = slot.song?.source === "library" && slot.song.link === t.page && !!t.page;
            return (
              <div key={t.id} className={`track ${chosen ? "on" : ""}`}>
                <button type="button" className="btn small ghost" onClick={() => setPlaying(playing?.id === t.id ? null : { id: t.id, url: t.url })} aria-label={`Play ${t.title}`}>
                  {playing?.id === t.id ? "■" : "▶"}
                </button>
                <span className="name" title={`${t.title} by ${t.creator}`}>
                  {t.title} <span className="dim">· {t.creator}</span>
                </span>
                <span className="dim">{lengthOf(t.seconds)}</span>
                <span className="chip" title={licenseLabel(t)}>{t.license === "cc0" ? "CC0" : "CC BY"}</span>
                <button type="button" className="btn small" disabled={!!freeBusy} onClick={() => useFree(t)}>
                  {freeBusy === t.id ? "Saving…" : chosen ? "✓ Chosen" : "Use this"}
                </button>
              </div>
            );
          })}
          {free?.more && (
            <button type="button" className="btn small ghost" disabled={!!freeBusy} onClick={() => searchFree(free.query, free.page + 1)}>
              {freeBusy === "search" ? "Loading…" : "More tracks"}
            </button>
          )}
          {freeError && <div className="bad">{freeError}</div>}
        </div>
        {slot.song?.credit && <p className="hint">Caption credit: {slot.song.credit}</p>}
      </div>

      <h4>Your music folder</h4>
      <div className="music-list">
        {tracks === null && !error && <p className="hint">Looking in the "Roopip music" folder in Drive…</p>}
        {tracks?.length === 0 && (
          <p className="hint">
            The "Roopip music" folder in Drive is empty. Pick a free track above, or add tracks you're allowed to use commercially, for example from Pixabay Music:{" "}
            {moods.map((m, i) => (
              <span key={m.label}>
                {i ? ", " : ""}
                <a href={pixabayUrl(m)} target="_blank" rel="noopener noreferrer">{m.label.toLowerCase()}</a>
              </span>
            ))}
            . Put a mood word in the file name ("calm acoustic …") and the app matches it to posts.
          </p>
        )}
        {ranked.slice(0, 8).map(({ track, mood }) => (
          <div key={track.id} className={`track ${slot.song?.driveId === track.id ? "on" : ""}`}>
            <button type="button" className="btn small ghost" onClick={() => preview(track)} aria-label={`Play ${track.name}`}>
              {playing?.id === track.id ? "■" : "▶"}
            </button>
            <span className="name">{songTitle(track.name)}</span>
            {mood && <span className="chip">{mood}</span>}
            <button type="button" className="btn small" onClick={() => choose(track)}>
              {slot.song?.driveId === track.id ? "✓ Chosen" : "Use this"}
            </button>
          </div>
        ))}
        {playing && <audio src={playing.url} autoPlay controls className="track-audio" onEnded={() => setPlaying(null)} />}
        <button type="button" className="btn small ghost" onClick={() => upload.current?.click()}>Add a track to the music folder</button>
        <input ref={upload} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && addTrack(e.target.files[0])} />
      </div>

      {lib && (
        <div className="banner">
          {video && !reelToRender ? (
            slot.song?.bakedInto ? (
              <>✓ "{slot.song.title}" is in the video, so this posts automatically.</>
            ) : (
              <>
                <button type="button" className="btn small primary" onClick={bake} disabled={!!progress}>Add "{slot.song!.title}" to the video</button>{" "}
                <span className="hint">Baked into the file, so Instagram gets it with sound and the app can post it for you.</span>
              </>
            )
          ) : reelToRender ? (
            <>The reel editor adds this track when it renders the reel (in the preview step), so it posts automatically.</>
          ) : (
            <>
              Instagram doesn't let apps add music to photos, so with photos this track can't be posted automatically. Make a B-roll video in the B-roll step and the track goes into it, or use a song saved on Instagram below and post by hand.
            </>
          )}
        </div>
      )}
      {progress && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
          <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
          <span>{progress.label}</span>
        </div>
      )}

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="ig-song">Or a song you've saved on Instagram</label>
        <div className="idea-ask">
          <input id="ig-song" type="text" placeholder="Song and artist" value={igSong} onChange={(e) => setIgSong(e.target.value)} />
          <button type="button" className="btn" disabled={!igSong.trim()} onClick={() => save({ song: { title: igSong.trim(), source: "instagram" }, music: "instagram" })}>
            {slot.song?.source === "instagram" && slot.song.title === igSong.trim() ? "✓ Saved" : "Use this song"}
          </button>
        </div>
        <div className="hint">Instagram's own music can only be added in the Instagram app, so this post won't go out automatically. When it's due, the app shows a reminder to post it and add "{igSong || "the song"}".</div>
      </div>

      {error && <div className="bad">{error}</div>}
      <div className="flow-nav">
        <button type="button" className="btn primary" onClick={() => next()}>Next: caption</button>
        <button type="button" className="btn ghost" onClick={() => next({ song: undefined, music: "none" })}>No music</button>
      </div>
    </div>
  );
}

function Options({ options, value, onPick, name }: { options: string[]; value: string; onPick: (v: string) => void; name: string }) {
  return (
    <div className="options" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={`option ${o === value ? "on" : ""}`} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function WordsStep({ slot, cal, save, next }: StepProps) {
  const idea = cal.ideas.find((i) => i.id === slot.ideaId);
  const captions = useMemo(() => captionOptions(slot, idea?.caption), [slot.pillar, slot.title, idea?.caption, slot.captionOptions?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctas = useMemo(() => ctaOptions(slot, idea?.cta), [slot.pillar, slot.format, idea?.cta]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => [...new Set([...slot.hashtags, ...hashtagOptions({ ...slot, hashtags: idea?.hashtags ?? slot.hashtags })])], [slot.ideaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [extraTag, setExtraTag] = useState("");
  const full = [slot.caption, slot.cta, slot.hashtags.join(" ")].filter(Boolean).join("\n\n");

  useEffect(() => {
    // First visit: start with the five most useful hashtags.
    if (slot.hashtags.length > HASHTAG_LIMIT || (!slot.hashtags.length && tags.length)) save({ hashtags: tags.slice(0, HASHTAG_LIMIT) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (t: string) => {
    if (slot.hashtags.includes(t)) save({ hashtags: slot.hashtags.filter((x) => x !== t) });
    else if (slot.hashtags.length < HASHTAG_LIMIT) save({ hashtags: [...slot.hashtags, t] });
  };

  return (
    <div className="flow-card">
      <h3>Caption</h3>
      <p className="hint">Pick one, then edit it so it sounds like you.</p>
      <Options name="Caption options" options={captions} value={slot.caption} onPick={(caption) => save({ caption })} />
      <textarea className="big" value={slot.caption} onChange={(e) => save({ caption: e.target.value })} aria-label="Caption" />
      <div className={`counter ${full.length > CAPTION_LIMIT ? "over" : ""}`}>{full.length} / {CAPTION_LIMIT} with call to action and hashtags</div>
      <button
        type="button"
        className="linkish"
        disabled={slot.askClaude}
        onClick={() => save({ askClaude: true, notes: "Write 3 caption options in our voice for this post (captionOptions)." })}
      >
        {slot.askClaude ? "Claude will write caption options on its next run (about 7 AM, 12 PM or 8 PM)." : "Ask Claude to write 3 more in our voice"}
      </button>

      <h3 style={{ marginTop: 20 }}>Call to action</h3>
      <Options name="Call to action options" options={ctas} value={slot.cta} onPick={(cta) => save({ cta })} />
      <input type="text" value={slot.cta} onChange={(e) => save({ cta: e.target.value })} aria-label="Call to action" />

      <h3 style={{ marginTop: 20 }}>Hashtags</h3>
      <p className="hint">Instagram allows {HASHTAG_LIMIT} per post now, so pick the {HASHTAG_LIMIT} that fit best. {slot.hashtags.length} of {HASHTAG_LIMIT} chosen.</p>
      <div className="tag-chips">
        {[...new Set([...tags, ...slot.hashtags])].map((t) => (
          <button key={t} type="button" className={`chip tag ${slot.hashtags.includes(t) ? "on" : ""}`} aria-pressed={slot.hashtags.includes(t)} onClick={() => toggleTag(t)} disabled={!slot.hashtags.includes(t) && slot.hashtags.length >= HASHTAG_LIMIT}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="idea-ask"
        onSubmit={(e) => {
          e.preventDefault();
          const t = extraTag.trim().replace(/^#?/, "#").replace(/\s+/g, "").toLowerCase();
          if (t.length > 1 && slot.hashtags.length < HASHTAG_LIMIT && !slot.hashtags.includes(t)) save({ hashtags: [...slot.hashtags, t] });
          setExtraTag("");
        }}
      >
        <input type="text" placeholder="Add your own hashtag" value={extraTag} onChange={(e) => setExtraTag(e.target.value)} />
        <button type="submit" className="btn" disabled={slot.hashtags.length >= HASHTAG_LIMIT}>Add</button>
      </form>
      <div className="flow-nav">
        <button type="button" className="btn primary" disabled={!slot.caption.trim()} onClick={() => next()}>Next: time</button>
      </div>
    </div>
  );
}

export function TimeStep({ slot, cal, save, next }: StepProps) {
  const s = useMemo(() => suggestTime(slot, cal.slots), [slot.id, slot.date, slot.format, cal.slots]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!slot.timeWhy) save({ time: s.time, timeWhy: s.why });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flow-card">
      <h3>When to post</h3>
      <div className="banner">
        <b>Suggested: {s.time}</b> {s.basis === "own" ? "(from Roopip's own Instagram numbers)" : "(from published research, until Roopip has its own numbers)"}
        <div className="hint">{s.why}</div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="f-date">Date</label>
          <input id="f-date" type="date" value={slot.date} onChange={(e) => e.target.value && save({ date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="f-time">Time</label>
          <input id="f-time" type="time" value={slot.time} onChange={(e) => save({ time: e.target.value, timeWhy: e.target.value === s.time ? s.why : "Chosen by hand." })} />
        </div>
      </div>
      <div className="tag-chips">
        <span className="hint">Also good:</span>
        {[s.time, ...s.alternatives].map((t) => (
          <button key={t} type="button" className={`chip tag ${slot.time === t ? "on" : ""}`} onClick={() => save({ time: t, timeWhy: t === s.time ? s.why : "One of the other good times." })}>
            {t}
          </button>
        ))}
      </div>
      <div className="flow-nav">
        <button type="button" className="btn primary" onClick={() => next()}>Next: preview</button>
      </div>
    </div>
  );
}

const STATUS_HELP =
  "Status shows where the post is: being made, waiting for Carli's approval, approved, scheduled to go out, then posted. The app moves it along as you go.";

export function PreviewStep({ slot, cal, save, onClose }: StepProps & { onClose: () => void }) {
  const needsRender = slot.format === "reel" && !slot.render && !(slot.media.length === 1 && isVideo(slot.media[0]));
  const byHand = slot.music === "instagram" && slot.song?.source === "instagram";
  const grid = slot.format === "post" || slot.format === "carousel";
  return (
    <div className="flow-preview">
      <div>
        <InstagramPreview slot={slot} />
        <p className="hint" style={{ textAlign: "center" }}>
          {slot.format === "story" ? "Tap the right side for the next frame, the left to go back, hold to pause." : grid && slot.media.length > 1 ? "Swipe or use the arrows to see each photo." : slot.format === "reel" ? "Tap to play." : ""}
        </p>
      </div>
      <div className="flow-card">
        <h3>Looks right?</h3>
        {needsRender && (
          <div className="field">
            <div className="label">Render the reel first</div>
            <ReelEditor slot={slot} save={save} />
          </div>
        )}
        {byHand && (
          <div className="banner warn">
            Posted by hand: when it's due, the app reminds you to open Instagram, post it and add <b>{slot.song!.title}</b>.
          </div>
        )}
        <p className="hint">{STATUS_HELP}</p>
        {["idea", "media", "editing"].includes(slot.status) && (
          <div className="flow-nav">
            <button type="button" className="btn primary" onClick={() => save({ status: "review", step: "done" })}>Send to Carli for approval</button>
            <button type="button" className="btn" onClick={() => save({ status: "approved", step: "done" })}>It's approved, schedule it</button>
          </div>
        )}
        {slot.status === "review" && (
          <div className="flow-nav">
            <span className="hint">Waiting for Carli's approval.</span>
            <button type="button" className="btn primary" onClick={() => save({ status: "approved" })}>Approve</button>
          </div>
        )}
        {["approved", "scheduled", "posted"].includes(slot.status) && <PostingPanel slot={slot} save={save} />}
        {grid && (
          <div style={{ marginTop: 18 }}>
            <div className="label">Where it lands on the grid</div>
            <GridPreview slots={cal.slots} highlight={slot.id} />
          </div>
        )}
        <div className="flow-nav">
          <button type="button" className="btn ghost" onClick={onClose}>Back to the calendar</button>
        </div>
      </div>
    </div>
  );
}
