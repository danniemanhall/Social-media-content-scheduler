import { useState } from "react";
import { CANVA_FOLDER, connectDrive, saveToAppFolder } from "../lib/drive";
import type { CanvaSize, MediaRef, Slot } from "../lib/types";

/** Instagram and Facebook's current sizes. Grid posts are 4:5 portrait. */
export const CANVA_SIZES: Record<CanvaSize, { label: string; width: number; height: number; note: string }> = {
  story: { label: "Story", width: 1080, height: 1920, note: "9:16, exported as JPG" },
  grid: { label: "Grid post", width: 1080, height: 1350, note: "4:5 portrait, exported as JPG" },
  reel: { label: "Reel", width: 1080, height: 1920, note: "9:16, exported as MP4" },
};

export function defaultCanvaSize(slot: Slot): CanvaSize {
  return slot.format === "story" ? "story" : slot.format === "reel" ? "reel" : "grid";
}

/** Opens a blank Canva design at exactly the right size. */
export function newCanvaDesignUrl(size: CanvaSize) {
  const s = CANVA_SIZES[size];
  return `https://www.canva.com/design?create=true&width=${s.width}&height=${s.height}&units=px`;
}

export function isCanvaLink(s: string) {
  return /^https:\/\/(www\.)?canva\.(com|link)\//i.test(s.trim());
}

const RUNS = "07:17, 12:17 or 20:17";

export function CanvaPanel({ slot, save }: { slot: Slot; save: (patch: Partial<Slot>) => void }) {
  const req = slot.canva;
  const [link, setLink] = useState(req?.link ?? "");
  const [size, setSize] = useState<CanvaSize>(req?.size ?? defaultCanvaSize(slot));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = () => {
    setError(null);
    if (!isCanvaLink(link)) return setError("Paste the design's Canva link (Share, then Copy link).");
    save({ canva: { link: link.trim(), size, requestedAt: new Date().toISOString(), status: "requested" } });
  };

  const addToPost = async () => {
    if (!req?.files?.length) return;
    setError(null);
    setBusy("Connecting Google Drive…");
    try {
      await connectDrive();
      const added: MediaRef[] = [];
      for (const [i, f] of req.files.entries()) {
        setBusy(`Saving page ${i + 1} of ${req.files.length} to Drive…`);
        const res = await fetch(`/api/canva-file?url=${encodeURIComponent(f.url)}`);
        if (res.status === 410) {
          save({ canva: { ...req, status: "requested", files: undefined, error: "The Canva download links expired, so Claude will export it again on the next run." } });
          return;
        }
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Download failed (${res.status})`);
        const blob = await res.blob();
        const video = f.type === "video";
        const name = `${slot.date} ${slot.title.slice(0, 40)}${req.files.length > 1 ? ` ${i + 1}` : ""}.${video ? "mp4" : "jpg"}`.replace(/[\\/:*?"<>|]/g, "-");
        const { isFolder: _f, ...ref } = await saveToAppFolder(CANVA_FOLDER, name, blob, video ? "video/mp4" : "image/jpeg");
        added.push(ref);
      }
      const media = [...slot.media.filter((m) => !added.some((a) => a.id === m.id)), ...added];
      save({ media, canva: { ...req, status: "added", addedAt: new Date().toISOString(), error: undefined } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="canva">
      <div className="canva-new">
        <span className="hint">New design at the right size:</span>
        {(Object.keys(CANVA_SIZES) as CanvaSize[]).map((k) => (
          <a key={k} className="btn small" href={newCanvaDesignUrl(k)} target="_blank" rel="noopener noreferrer" title={`${CANVA_SIZES[k].width} × ${CANVA_SIZES[k].height}`}>
            {CANVA_SIZES[k].label}
          </a>
        ))}
      </div>

      {!req || req.status === "failed" || req.status === "added" ? (
        <>
          <div className="canva-form">
            <input type="url" placeholder="Paste a Canva design link" value={link} onChange={(e) => setLink(e.target.value)} />
            <select value={size} onChange={(e) => setSize(e.target.value as CanvaSize)} aria-label="Size">
              {(Object.keys(CANVA_SIZES) as CanvaSize[]).map((k) => (
                <option key={k} value={k}>
                  {CANVA_SIZES[k].label} {CANVA_SIZES[k].width}×{CANVA_SIZES[k].height}
                </option>
              ))}
            </select>
            <button type="button" className="btn small primary" onClick={request}>
              {req?.status === "added" ? "Fetch again" : "Fetch from Canva"}
            </button>
          </div>
          <div className="hint">{CANVA_SIZES[size].note}. Claude exports it on the next run ({RUNS}) and it's ready to add here.</div>
          {req?.status === "added" && <div className="ok">Added to this post from Canva.</div>}
          {req?.status === "failed" && <div className="bad">Canva export failed: {req.error}</div>}
        </>
      ) : req.status === "requested" ? (
        <div>
          <div>
            Waiting for Claude to export this at {CANVA_SIZES[req.size].label.toLowerCase()} size ({CANVA_SIZES[req.size].width}×{CANVA_SIZES[req.size].height}). Next run: {RUNS}.
          </div>
          {req.error && <div className="hint">{req.error}</div>}
          <button type="button" className="btn ghost small" onClick={() => save({ canva: undefined })}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <div className="ok">
            Ready: {req.files?.length ?? 0} {req.files?.length === 1 ? "file" : "files"} exported at {CANVA_SIZES[req.size].width}×{CANVA_SIZES[req.size].height}.
          </div>
          <button type="button" className="btn small primary" disabled={!!busy} onClick={addToPost}>
            {busy ?? "Add to post"}
          </button>{" "}
          <span className="hint">Saved to the "{CANVA_FOLDER}" folder in Drive.</span>
        </div>
      )}
      {error && <div className="bad">{error}</div>}
    </div>
  );
}
