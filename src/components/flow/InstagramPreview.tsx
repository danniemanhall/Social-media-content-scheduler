import { useEffect, useRef, useState, type PointerEvent } from "react";
import { HASHTAG_LIMIT } from "../../lib/postSuggest";
import { isVideo } from "../../lib/reel";
import type { MediaRef, Slot } from "../../lib/types";
import { useImageUrl, useVideoUrl } from "./useMediaUrl";

/** What a post will show, in order. A rendered reel counts as one video. */
export function framesOf(slot: Slot): MediaRef[] {
  if (slot.format === "reel" && slot.render?.driveId) {
    return [{ id: slot.render.driveId, source: "drive", name: slot.render.name, mimeType: "video/mp4", width: 1080, height: 1920, durationSec: slot.render.seconds }];
  }
  if (slot.format === "reel") {
    const v = slot.media.find(isVideo);
    return v ? [v] : slot.media.slice(0, 1);
  }
  if (slot.format === "post") return slot.media.slice(0, 1);
  return slot.media.slice(0, slot.format === "carousel" ? 10 : 20);
}

const when = (s: Slot) => {
  const d = new Date(`${s.date}T${s.time}:00+02:00`);
  return d.toLocaleString("en-ZA", { day: "numeric", month: "long", timeZone: "Africa/Johannesburg" });
};

/** One photo or video, cropped and centred the way Instagram will show it. */
function Frame({ media, play, onEnded, muted = true }: { media: MediaRef; play: boolean; onEnded?: () => void; muted?: boolean }) {
  const img = useImageUrl(media);
  const video = isVideo(media);
  const v = useVideoUrl(media, video && play);
  if (video && v.url) return <video className="ig-media" src={v.url} autoPlay={play} muted={muted} playsInline onEnded={onEnded} loop={!onEnded} />;
  return (
    <div className="ig-media" style={img ? { backgroundImage: `url("${img}")` } : undefined}>
      {!img && <span className="ig-missing">{media.name}</span>}
      {video && <span className="ig-playing">{v.loading ? "Loading video…" : v.error ? v.error : "▶"}</span>}
    </div>
  );
}

function Caption({ slot, full }: { slot: Slot; full?: boolean }) {
  const [open, setOpen] = useState(!!full);
  const tags = slot.hashtags.slice(0, HASHTAG_LIMIT).join(" ");
  const text = [slot.caption, slot.cta].filter(Boolean).join("\n\n");
  const short = text.split("\n")[0].slice(0, 80);
  if (!open && (short.length < text.length || tags)) {
    return (
      <div className="ig-caption" onClick={() => setOpen(true)}>
        <b>roopip</b> {short.trim()}
        <span className="ig-more">… more</span>
      </div>
    );
  }
  return (
    <div className="ig-caption open">
      <b>roopip</b> {text}
      {tags && (
        <>
          {"\n\n"}
          <span className="ig-tags">{tags}</span>
        </>
      )}
    </div>
  );
}

function Header({ slot, light }: { slot: Slot; light?: boolean }) {
  return (
    <div className={`ig-top ${light ? "light" : ""}`}>
      <img src="/apple-touch-icon.png" alt="" className="ig-av" />
      <b>roopip</b>
      <span className="ig-dim">{slot.format === "story" ? "Now" : ""}</span>
      {slot.song && (
        <span className="ig-song" title={slot.song.source === "instagram" ? "Added in Instagram when it's posted" : "Baked into the video"}>
          ♫ {slot.song.title}
        </span>
      )}
    </div>
  );
}

/** A story: tap the right to go on, the left to go back, hold to pause. Photos show for 5 seconds. */
function StoryPreview({ slot, frames }: { slot: Slot; frames: MediaRef[] }) {
  const [i, setI] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef(0);
  const cur = frames[Math.min(i, frames.length - 1)];
  const video = cur && isVideo(cur);
  useEffect(() => setT(0), [i]);
  useEffect(() => {
    if (paused || video || !frames.length) return;
    const id = setInterval(() => setT((x) => x + 0.02), 100);
    return () => clearInterval(id);
  }, [paused, video, frames.length, i]);
  useEffect(() => {
    if (t >= 1) {
      setT(0);
      setI((x) => (x + 1 < frames.length ? x + 1 : 0));
    }
  }, [t, frames.length]);
  const tap = (e: PointerEvent<HTMLDivElement>) => {
    if (Date.now() - held.current > 300) return; // that was a hold
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) setI((x) => Math.max(0, x - 1));
    else setI((x) => (x + 1 < frames.length ? x + 1 : 0));
  };
  if (!cur) return <div className="ig-phone story empty">Add photos to see the story.</div>;
  return (
    <div
      className="ig-phone story"
      onPointerDown={() => {
        held.current = Date.now();
        setPaused(true);
      }}
      onPointerUp={(e) => {
        setPaused(false);
        tap(e);
      }}
      onPointerLeave={() => setPaused(false)}
      role="group"
      aria-label={`Story preview, frame ${i + 1} of ${frames.length}. Tap the right side for the next frame.`}
    >
      <div className="ig-bars">
        {frames.map((f, j) => (
          <span key={f.id + j}>
            <i style={{ width: j < i ? "100%" : j === i ? `${video ? 100 : Math.min(100, t * 100)}%` : "0%" }} />
          </span>
        ))}
      </div>
      <Header slot={slot} light />
      <Frame key={cur.id + i} media={cur} play onEnded={() => setI((x) => (x + 1 < frames.length ? x + 1 : 0))} />
      {slot.cta && <div className="ig-sticker">{slot.cta}</div>}
      <div className="ig-reply">Send message</div>
    </div>
  );
}

function ReelPreview({ slot, frames }: { slot: Slot; frames: MediaRef[] }) {
  const [play, setPlay] = useState(false);
  const cur = frames[0];
  return (
    <div className="ig-phone reel" onClick={() => setPlay(true)}>
      {cur ? <Frame media={cur} play={play} /> : <div className="ig-media"><span className="ig-missing">Add video or photos to see the reel.</span></div>}
      {!play && cur && isVideo(cur) && <button type="button" className="ig-bigplay" aria-label="Play">▶</button>}
      <div className="ig-side" aria-hidden="true">
        <span>♡</span>
        <span>💬</span>
        <span>➤</span>
        <span>⋯</span>
      </div>
      <div className="ig-reel-foot">
        <div className="ig-top light" style={{ position: "static", padding: 0 }}>
          <img src="/apple-touch-icon.png" alt="" className="ig-av" />
          <b>roopip</b>
          <span className="ig-follow">Follow</span>
        </div>
        <Caption slot={slot} />
        <div className="ig-audio">♫ {slot.song ? slot.song.title : slot.music === "none" ? "Original audio" : "roopip · Original audio"}</div>
      </div>
    </div>
  );
}

/** A grid post or carousel as it shows in the feed: swipe, or use the arrows. */
function FeedPreview({ slot, frames }: { slot: Slot; frames: MediaRef[] }) {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  const go = (d: number) => setI((x) => Math.min(frames.length - 1, Math.max(0, x + d)));
  return (
    <div className="ig-phone feed">
      <Header slot={slot} />
      <div
        className="ig-carousel"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current !== null && Math.abs(e.clientX - start.current) > 30) go(e.clientX < start.current ? 1 : -1);
          start.current = null;
        }}
      >
        <div className="ig-track" style={{ transform: `translateX(-${i * 100}%)` }}>
          {frames.length ? frames.map((f, j) => <Frame key={f.id + j} media={f} play={j === i} />) : <div className="ig-media"><span className="ig-missing">Add a photo to see the post.</span></div>}
        </div>
        {frames.length > 1 && (
          <>
            <span className="ig-count">{i + 1}/{frames.length}</span>
            {i > 0 && <button type="button" className="ig-arrow left" onClick={() => go(-1)} aria-label="Previous photo">‹</button>}
            {i < frames.length - 1 && <button type="button" className="ig-arrow right" onClick={() => go(1)} aria-label="Next photo">›</button>}
          </>
        )}
      </div>
      <div className="ig-actions" aria-hidden="true">
        <span>♡ 💬 ➤</span>
        {frames.length > 1 && (
          <span className="ig-dots">
            {frames.map((f, j) => <i key={f.id + j} className={j === i ? "on" : ""} />)}
          </span>
        )}
        <span>🔖</span>
      </div>
      <Caption slot={slot} />
      <div className="ig-date">{when(slot)}</div>
    </div>
  );
}

export function InstagramPreview({ slot }: { slot: Slot }) {
  const frames = framesOf(slot);
  if (slot.format === "story") return <StoryPreview slot={slot} frames={frames} />;
  if (slot.format === "reel") return <ReelPreview slot={slot} frames={frames} />;
  return <FeedPreview slot={slot} frames={frames} />;
}
