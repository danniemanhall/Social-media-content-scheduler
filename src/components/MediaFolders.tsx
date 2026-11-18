import { useState } from "react";
import { folderIdFrom, isGooglePhotosLink, type MediaLibraryState } from "../lib/mediaIndex";

/** The Drive folders the app draws media suggestions from. */
export function MediaFolders({ lib }: { lib: MediaLibraryState }) {
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const add = async () => {
    setMsg(null);
    if (isGooglePhotosLink(link)) {
      return setMsg(
        "Google Photos albums can't be linked: since 2025 Google no longer lets apps read albums. Save the photos into a Google Drive folder and add that folder instead.",
      );
    }
    const id = folderIdFrom(link);
    if (!id) return setMsg("Paste a Google Drive folder link (it has /folders/ in it).");
    if (lib.folders.some((f) => f.id === id)) return setMsg("That folder is already on the list.");
    await lib.setFolders([...lib.folders, { id, name: name.trim() || "New folder" }]);
    setLink("");
    setName("");
    setMsg("Added. Click Scan again on the Media tab to pick up its files.");
  };

  return (
    <div className="card">
      <h3>Media folders</h3>
      <p style={{ margin: "8px 0", fontSize: 14, color: "var(--muted)" }}>
        Media suggestions come from these Google Drive folders and everything inside them. New files show up after the next scan on the Media tab.
      </p>
      <ul style={{ paddingLeft: 18 }}>
        {lib.folders.map((f) => (
          <li key={f.id}>
            <a href={`https://drive.google.com/drive/folders/${f.id}`} target="_blank" rel="noopener noreferrer">{f.name}</a>{" "}
            {lib.folders.length > 1 && (
              <button className="btn ghost small" onClick={() => void lib.setFolders(lib.folders.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="canva-form">
        <input type="url" placeholder="Drive folder link" value={link} onChange={(e) => setLink(e.target.value)} />
        <input type="text" placeholder="Name, e.g. Christmas shoot" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn small" onClick={() => void add()}>Add folder</button>
      </div>
      {msg && <p style={{ fontSize: 14, margin: "6px 0 0" }}>{msg}</p>}
    </div>
  );
}
