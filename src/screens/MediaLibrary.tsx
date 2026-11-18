import { useMemo } from "react";
import { DriveBrowser } from "../components/DriveBrowser";
import { Thumb } from "../components/Thumb";
import { brandFit, FIT_WARN } from "../lib/brandFit";
import { useDriveConnected } from "../lib/useDrive";
import type { MediaLibraryState } from "../lib/mediaIndex";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MediaLibrary({ lib }: { lib: MediaLibraryState }) {
  const connected = useDriveConnected();
  const items = lib.index?.items ?? [];
  const checked = items.filter((m) => lib.looks[m.id]);
  const offBrand = useMemo(
    () =>
      checked
        .map((m) => ({ m, fit: brandFit(lib.looks[m.id]) }))
        .filter((x) => x.fit.score < FIT_WARN)
        .sort((a, b) => a.fit.score - b.fit.score),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib.index, lib.looks],
  );

  return (
    <div>
      <div className="section-head">
        <h2>Media library</h2>
        <span className="hint">
          Straight from Roopip's Google Drive. Add new shoots to these folders and they show up here. Change the folders under <b>Brand &amp; ideas</b>.
        </span>
      </div>

      <div className="banner" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          {lib.progress ??
            (lib.index
              ? `${items.length} photos and clips in ${lib.folders.length} folders, ${checked.length} colour-checked. Last scanned ${when(lib.index.at)}.`
              : "Scan the media folders so the app can suggest media for each post and check it against the brand.")}
        </div>
        <button className="btn small primary" disabled={!!lib.progress || !connected} title={connected ? "" : "Connect Google Drive below first"} onClick={() => void lib.refresh()}>
          {lib.index ? "Scan again" : "Scan folders"}
        </button>
      </div>
      {lib.error && <div className="banner error">{lib.error}</div>}

      {offBrand.length > 0 && (
        <details className="section" style={{ marginBottom: 16 }}>
          <summary>
            <b>{offBrand.length} files may not suit the Roopip look</b> <span className="hint">(they're still usable, just suggested last)</span>
          </summary>
          <div className="lib-grid" style={{ marginTop: 10 }}>
            {offBrand.slice(0, 40).map(({ m, fit }) => (
              <a key={m.id} className="lib-item" href={m.link} target="_blank" rel="noopener noreferrer" title={fit.reasons.join(" ")}>
                <Thumb media={m} className="img" />
                <div className="name">{m.name}</div>
                <div className="name bad" style={{ whiteSpace: "normal" }}>{fit.reasons[0]}</div>
              </a>
            ))}
          </div>
        </details>
      )}

      <DriveBrowser roots={lib.folders} library={lib.index?.items} onConnected={() => !lib.index && void lib.refresh()} />
    </div>
  );
}
