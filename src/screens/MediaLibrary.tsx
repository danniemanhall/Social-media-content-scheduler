import { DriveBrowser } from "../components/DriveBrowser";

export function MediaLibrary() {
  return (
    <div>
      <div className="section-head">
        <h2>Media library</h2>
        <span className="hint">Straight from Roopip's Google Drive. Add new shoots to these folders and they show up here.</span>
      </div>
      <DriveBrowser />
    </div>
  );
}
