import { useEffect, useState } from "react";
import { shortDate } from "../lib/dates";
import type { Slot } from "../lib/types";

const at = (s: Slot) => Date.parse(`${s.date}T${s.time || "12:00"}:00+02:00`);

/**
 * Posts that use a song saved on Instagram can't be posted by the app, so
 * when one is due (from 2 hours before until it's marked posted) this asks
 * whoever has the app open to post it and add the song.
 */
export function dueByHand(slots: Slot[], now = Date.now()): Slot[] {
  return slots.filter(
    (s) => s.music === "instagram" && ["approved", "scheduled"].includes(s.status) && at(s) - now < 2 * 3600_000 && now - at(s) < 3 * 86_400_000,
  );
}

export function HandPostReminders({ slots, onOpen }: { slots: Slot[]; onOpen: (s: Slot) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const due = dueByHand(slots, now);
  if (!due.length) return null;
  return (
    <div className="banner warn" role="alert">
      {due.map((s) => (
        <div key={s.id}>
          <b>Post by hand {at(s) > now ? `at ${s.time}` : `(was due ${shortDate(s.date)} ${s.time})`}:</b> {s.title}.{" "}
          {s.song ? <>Open Instagram, post it and add the song <b>{s.song.title}</b>.</> : "Open Instagram and post it with a song."}{" "}
          <button type="button" className="btn small" onClick={() => onOpen(s)}>Open the post</button>
        </div>
      ))}
    </div>
  );
}
