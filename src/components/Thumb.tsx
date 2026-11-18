import { useEffect, useState } from "react";
import { driveConnected, freshThumbnail } from "../lib/drive";
import { getFile } from "../lib/localMedia";
import type { MediaRef } from "../lib/types";

/**
 * A media preview that keeps working after Drive's short-lived thumbnail
 * links expire: it asks Drive for a fresh link, and falls back to the file
 * name when there's nothing to show.
 */
export function Thumb({ media, className = "mthumb" }: { media: MediaRef; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setSrc(null);
    void (async () => {
      if (media.source === "local") {
        const blob = await getFile(media.id);
        if (blob && blob.type.startsWith("image/") && live) setSrc((objectUrl = URL.createObjectURL(blob)));
        return;
      }
      const fresh = driveConnected() ? await freshThumbnail(media.id).catch(() => null) : null;
      if (live) setSrc(fresh ?? media.thumbnail ?? null);
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media.id, media.source, media.thumbnail]);

  const video = media.mimeType.startsWith("video/");
  return (
    <div className={className}>
      {src && !failed ? (
        <img src={src} alt={media.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-fallback">
          <span aria-hidden="true">{video ? "▶" : "◻"}</span>
          <span>{driveConnected() || media.source === "local" ? media.name : "Connect Drive on the Media tab to see this photo"}</span>
        </span>
      )}
      {video && src && !failed && <span className="thumb-play" aria-hidden="true">▶</span>}
    </div>
  );
}

/** A current thumbnail URL for a Drive file (the saved one may have expired). */
export function useThumbUrl(media: MediaRef | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(media?.source === "drive" ? undefined : media?.thumbnail);
  useEffect(() => {
    let live = true;
    if (!media || media.source !== "drive") {
      setUrl(media?.thumbnail);
      return;
    }
    setUrl(media.thumbnail);
    if (driveConnected()) void freshThumbnail(media.id).then((u) => live && u && setUrl(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [media?.id, media?.source, media?.thumbnail]);
  return url;
}
