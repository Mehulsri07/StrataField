import { useEffect, useState, useSyncExternalStore } from "react";
import { useDataVersion } from "./data";
import type { BackupInfo, BorewellListItem, StartupStatus } from "@strata/core";
import { RECENT_YEARS } from "@strata/core";
import { api } from "./api";

export function useStartup() {
  const [status, setStatus] = useState<StartupStatus | null>(null);
  useEffect(() => {
    api.startupStatus().then(setStatus).catch((e) => setStatus({
      dataFolder: "", open: null, legacyImport: null, legacyImportError: null, automaticBackup: null, error: String(e),
    }));
  }, []);
  return status;
}

export interface Summary {
  borewells: number;
  located: number;
  lastBackup: BackupInfo | null;
}

/** Counts for the sidebar and status bar; reloads when data changes. */
export function useSummary(enabled: boolean) {
  const { version } = useDataVersion();
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true; // ignore a slow answer once a newer load has started
    Promise.all([api.borewells.search(), api.backups.list()])
      .then(([items, backups]) => current && setSummary(summarise(items, backups)))
      .catch(() => current && setSummary(null));
    return () => {
      current = false;
    };
  }, [enabled, version]);
  return summary;
}

function summarise(items: BorewellListItem[], backups: BackupInfo[]): Summary {
  return {
    borewells: items.length,
    located: items.filter((i) => i.borewell.latitude != null && i.borewell.longitude != null).length,
    lastBackup: backups[0] ?? null,
  };
}

// ── Which water readings count ──────────────────────────────────────────

const WATER_YEARS = "strata-water-years";
const waterYearsListeners = new Set<() => void>();
let waterYears = (() => {
  try {
    const v = Number(localStorage.getItem(WATER_YEARS) ?? RECENT_YEARS);
    return [0, 1, 3, 5].includes(v) ? v : RECENT_YEARS;
  } catch {
    return RECENT_YEARS;
  }
})();

/**
 * How many years of water readings (counted back from the newest) the water colours and typical
 * figures use; 0 is the whole record. Remembered on this computer, and shared by every screen.
 */
export function useWaterYears(): [number, (years: number) => void] {
  const years = useSyncExternalStore((changed) => { waterYearsListeners.add(changed); return () => waterYearsListeners.delete(changed); }, () => waterYears);
  return [years, (next) => {
    waterYears = next;
    try { localStorage.setItem(WATER_YEARS, String(next)); } catch { /* still applies for this session */ }
    waterYearsListeners.forEach((changed) => changed());
  }];
}
