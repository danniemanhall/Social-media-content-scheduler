import { useCallback, useEffect, useState } from "react";
import { useDriveConnected } from "../lib/useDrive";
import { DEFAULT_FOLDERS, type MediaFolder } from "../lib/mediaIndex";
import { connectDrive, disconnectDrive, driveAccount, driveConfigured, driveIsShared, listFolder, type DriveItem } from "../lib/drive";


interface Props {
  /** When set, clicking files selects them and a "Use" button hands them back. */
  onPick?: (items: DriveItem[]) => void;
  /** The media folders to start from (from Brand & ideas). */
  roots?: MediaFolder[];
  /** Called once Drive is connected, e.g. to start a scan. */
  onConnected?: () => void;
}

export function DriveBrowser({ onPick, roots, onConnected }: Props) {
  const ROOTS = roots?.length ? roots : DEFAULT_FOLDERS;
  const connected = useDriveConnected();
  const [path, setPath] = useState<{ id: string; name: string }[]>([ROOTS[0]]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, DriveItem>>({});
  const folder = path[path.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listFolder(folder.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [folder.id]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!driveConfigured) {
    return (
      <div className="banner">
        Google Drive isn't connected to the app yet. Once the Google sign-in key is added (see the setup guide in the README),
        this shows the Product Photos and Brand Assets folders. For now, use <b>Upload</b> on a post to add files from this device.
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="banner">
        <p style={{ margin: "0 0 10px" }}>
          Sign in with <b>carli@roopip.co.za</b>, the Google account that owns Roopip's Drive folders, and tick both Google Drive boxes.
          {driveIsShared() && " You only need to do this once: Drive then stays connected for everyone until someone clicks Sign out of Drive."}
        </p>
        <button className="btn primary" onClick={() => connectDrive().then(() => onConnected?.(), (e) => setError(String(e.message ?? e)))}>
          Connect Google Drive
        </button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    );
  }

  const toggle = (it: DriveItem) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[it.id]) delete next[it.id];
      else next[it.id] = it;
      return next;
    });

  return (
    <div>
      <div className="crumbs">
        {ROOTS.map((r) => (
          <button key={r.id} className="btn small" aria-pressed={path[0].id === r.id} onClick={() => setPath([r])} style={path[0].id === r.id ? { background: "var(--espresso)", color: "var(--ivory)" } : undefined}>
            {r.name}
          </button>
        ))}
        <span style={{ marginLeft: 8 }} />
        {path.map((p, i) => (
          <span key={p.id}>
            {i > 0 && " / "}
            <button onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button>
          </span>
        ))}
        <span className="spacer" />
<span className="hint" style={{ fontSize: 12 }}>{driveAccount() ? `Drive: ${driveAccount()}` : ""}</span>
        <button
          className="btn small"
          title={driveIsShared() ? "Signs Roopip's Drive out of the app for everyone, until someone connects again" : "Sign out of Google Drive here and pick a different Google account"}
          onClick={() => {
            setItems([]);
            void disconnectDrive();
          }}
        >
          Sign out of Drive
        </button>
        {onPick && (
          <button className="btn primary small" disabled={!Object.keys(selected).length} onClick={() => onPick(Object.values(selected))}>
            Use {Object.keys(selected).length || ""} selected
          </button>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      {loading ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nothing here yet.</p>
      ) : (
        <div className="lib-grid">
          {items.map((it) =>
            it.isFolder ? (
              <button key={it.id} className="lib-item" onClick={() => setPath([...path, { id: it.id, name: it.name }])}>
                <div className="img">📁</div>
                <div className="name">{it.name}</div>
              </button>
            ) : (
              <button
                key={it.id}
                className="lib-item"
                onClick={() => (onPick ? toggle(it) : it.link && window.open(it.link, "_blank", "noopener"))}
                style={selected[it.id] ? { outline: "3px solid var(--caramel)" } : undefined}
              >
                <div className="img" style={{ backgroundImage: it.thumbnail ? `url("${it.thumbnail}")` : undefined }}>
                  {!it.thumbnail && (it.mimeType.startsWith("video/") ? "▶" : "◻")}
                </div>
                <div className="name" title={it.name}>
                  {it.mimeType.startsWith("video/") ? "▶ " : ""}
                  {it.name}
                </div>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
