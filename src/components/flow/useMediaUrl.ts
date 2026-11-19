import { useEffect, useState } from "react";
import { downloadFile, freshThumbnail } from "../../lib/drive";
import { getFile } from "../../lib/localMedia";
import { useDriveConnected } from "../../lib/useDrive";
import type { MediaRef } from "../../lib/types";

/**
 * A URL to show a post's photo large (Drive's 1600 px preview, or the local
 * file). For a video it's the poster frame; use `useVideoUrl` to play it.
 */
export function useImageUrl(media: MediaRef | undefined): string | undefined {
  const connected = useDriveConnected();
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    setUrl(undefined);
    if (!media) return;
    void (async () => {
      if (media.source === "local") {
        const blob = await getFile(media.id);
        if (blob && live && blob.type.startsWith("image/")) setUrl((objectUrl = URL.createObjectURL(blob)));
        return;
      }
      if (!connected) return live ? setUrl(media.thumbnail) : undefined;
      const fresh = await freshThumbnail(media.id).catch(() => null);
      if (live) setUrl(fresh ? fresh.replace(/=s\d+$/, "=s1600") : media.thumbnail);
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media?.id, media?.source, media?.thumbnail, connected]);
  return url;
}

/** Downloads a video once `enabled` is true, for playing it in the preview. */
export function useVideoUrl(media: MediaRef | undefined, enabled: boolean): { url?: string; loading: boolean; error?: string } {
  const [state, setState] = useState<{ url?: string; loading: boolean; error?: string }>({ loading: false });
  useEffect(() => {
    if (!media || !enabled || !media.mimeType.startsWith("video/")) return;
    let live = true;
    let objectUrl: string | null = null;
    setState({ loading: true });
    void (async () => {
      try {
        const blob = media.source === "drive" ? await downloadFile(media.id) : await getFile(media.id);
        if (!blob) throw new Error("The video is on the device it was added from.");
        if (live) setState({ url: (objectUrl = URL.createObjectURL(blob)), loading: false });
      } catch (e) {
        if (live) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media?.id, media?.source, enabled]);
  return state;
}
