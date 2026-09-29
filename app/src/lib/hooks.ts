import { useEffect, useRef, useState } from "react";
import type { BackupInfo, BorewellListItem, StartupStatus } from "@strata/core";
import { api } from "./api";

/** How often screens check whether another Strata app changed the shared database. */
const DATA_POLL_MS = 5000;

/**
 * Bumps whenever the shared database changes underneath us (another Strata app wrote to it).
 * Screens add it to their effect dependencies to reload.
 */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const tick = () =>
      api.dataVersion().then((v) => {
        if (last.current !== null && v !== last.current) setVersion((n) => n + 1);
        last.current = v;
      }).catch(() => {});
    tick();
    const id = window.setInterval(tick, DATA_POLL_MS);
    return () => window.clearInterval(id);
  }, []);
  return version;
}

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
  const version = useDataVersion();
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
