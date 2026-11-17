import { DriveBrowser } from "./DriveBrowser";
import type { MediaRef } from "../lib/types";

export function MediaPicker({ onPick, onClose }: { onPick: (items: MediaRef[]) => void; onClose: () => void }) {
  return (
    <>
      <div className="scrim" style={{ zIndex: 30 }} onClick={onClose} />
      <div className="drawer" style={{ zIndex: 31, width: "min(900px, 100vw)" }} role="dialog" aria-label="Choose from Drive">
        <header>
          <h2 style={{ flex: 1 }}>Choose from Drive</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <DriveBrowser onPick={(items) => onPick(items.map(({ isFolder: _f, ...ref }) => ref))} />
      </div>
    </>
  );
}
