/**
 * Updates: StrataField checks GitHub Releases for a newer version. An update is only installed when
 * it is signed with the project's key (the public half is in tauri.conf.json), so nobody else can
 * push one. Installing closes the app, runs the new installer (with a progress window) and reopens.
 */
import { isPreview } from "./api";

export interface AvailableUpdate {
  version: string;
  notes: string;
  /** Downloads and installs, reporting progress (0-1, or null when the size is unknown), then restarts. */
  install: (onProgress?: (fraction: number | null) => void) => Promise<void>;
}

const LAST_CHECK = "strata-update-last-check";
const DAY = 24 * 60 * 60 * 1000;

/** Asks GitHub whether a newer version exists. Resolves null when up to date. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (isPreview) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  try { localStorage.setItem(LAST_CHECK, String(Date.now())); } catch { /* storage unavailable */ }
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? "",
    async install(onProgress) {
      let total: number | null = null, received = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? null;
        if (e.event === "Progress") { received += e.data.chunkLength; onProgress?.(total ? received / total : null); }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}

/** True when the last automatic check was more than a day ago. */
export function checkIsDue(): boolean {
  try { return Date.now() - Number(localStorage.getItem(LAST_CHECK) ?? 0) > DAY; } catch { return true; }
}
