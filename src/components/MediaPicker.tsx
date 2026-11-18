import { DriveBrowser } from "./DriveBrowser";
import type { MediaRef } from "../lib/types";
import type { MediaLibraryState } from "../lib/mediaIndex";

export function MediaPicker({ onPick, onClose, lib }: { onPick: (items: MediaRef[]) => void; onClose: () => void; lib: MediaLibraryState }) {
  return (
    <>
      <div className="scrim" style={{ zIndex: 30 }} onClick={onClose} />
      <div className="drawer" style={{ zIndex: 31, width: "min(900px, 100vw)" }} role="dialog" aria-label="Choose from Drive">
        <header>
          <h2 style={{ flex: 1 }}>Choose from Drive</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <DriveBrowser
          roots={lib.folders}
          library={lib.index?.items}
          onPick={(items) => onPick(items.map(({ isFolder: _f, ...ref }) => { const { path: _p, ...clean } = ref as typeof ref & { path?: string }; return clean; }))}
        />
      </div>
    </>
  );
}
