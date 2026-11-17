import { useEffect, useState } from "react";
import { clearOutbox, filesFor, outboxReady, sendToOutbox } from "../lib/outbox";
import type { Slot } from "../lib/types";

const when = (s: Slot) =>
  new Date(`${s.date}T${s.time}:00+02:00`).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

/** Approved posts: hand them to the publisher, or see how posting went. */
export function PostingPanel({ slot, save }: { slot: Slot; save: (patch: Partial<Slot>) => void }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void outboxReady().then(setReady), []);

  const pub = slot.publish;
  if (!["approved", "scheduled", "posted"].includes(slot.status) && !pub?.error) return null;

  if (slot.format === "reel" && slot.music === "instagram") {
    return <div className="hint-text">This reel uses Instagram music, so it's posted by hand: download it from the reel editor and add the sound in Instagram.</div>;
  }

  if (slot.status === "posted" && pub?.postedAt) {
    return (
      <div className="hint-text">
        Posted {new Date(pub.postedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        {pub.ig?.permalink && <> · <a href={pub.ig.permalink} target="_blank" rel="noopener">View on Instagram</a></>}
        {pub.fb?.postId && <> · on Facebook</>}
        {pub.fb?.skipped && <> · Facebook: {pub.fb.skipped}</>}
      </div>
    );
  }

  const schedule = async () => {
    setError(null);
    try {
      const files = await sendToOutbox(slot, setStep);
      save({ status: "scheduled", publish: { files, queuedAt: new Date().toISOString() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };
  const unschedule = async () => {
    if (pub) await clearOutbox(pub.files);
    save({ status: "approved", publish: undefined });
  };

  if (slot.status === "scheduled" && pub) {
    return (
      <div>
        <div className="hint-text">
          Scheduled for <b>{when(slot)}</b>. It goes out within 15 minutes of that time, to Instagram{slot.format === "story" ? "" : " and Facebook"}.
          {pub.ig?.containerId && !pub.ig.mediaId && " Instagram is processing the video."}
        </div>
        {pub.error && <div className="error-text">Last try failed: {pub.error} It will try again.</div>}
        <button className="btn small" type="button" onClick={unschedule}>Unschedule</button>
      </div>
    );
  }

  const nothing = filesFor(slot).length === 0;
  return (
    <div>
      {pub?.error && <div className="error-text">Posting failed: {pub.error}</div>}
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <button className="btn primary" type="button" onClick={schedule} disabled={!ready || !!step || nothing}>
          {step ?? `Schedule for ${when(slot)}`}
        </button>
      </div>
      <div className="hint-text">
        {ready === false
          ? "Auto-posting isn't connected yet."
          : nothing
            ? slot.format === "reel" ? "Render the reel and save it to Drive first." : "Add a photo or video first."
            : "Posts to Instagram and the Facebook Page at the date and time above."}
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
