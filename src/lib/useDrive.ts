import { useEffect, useState } from "react";
import { driveConnected, onDriveChange, restoreDrive } from "./drive";

/** Whether Google Drive is connected, updating when it connects or signs out. */
export function useDriveConnected() {
  const [connected, setConnected] = useState(driveConnected());
  useEffect(() => {
    const off = onDriveChange(() => setConnected(driveConnected()));
    void restoreDrive().then(() => setConnected(driveConnected()));
    return off;
  }, []);
  return connected;
}
