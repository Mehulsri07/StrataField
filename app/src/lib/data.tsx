import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

/** How often to check whether another Strata app changed the shared database. */
const POLL_MS = 5000;

interface DataVersion {
  /** Changes whenever data changed: saved here (bump) or by another Strata app. */
  version: number;
  /** Call after saving, so every screen reloads. */
  bump: () => void;
}

const Ctx = createContext<DataVersion>({ version: 0, bump: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const last = useRef<number | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const tick = () =>
      api.dataVersion().then((v) => {
        if (last.current !== null && v !== last.current) setVersion((n) => n + 1);
        last.current = v;
      }).catch(() => {});
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  return <Ctx.Provider value={{ version, bump }}>{children}</Ctx.Provider>;
}

export function useDataVersion() {
  return useContext(Ctx);
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Loads data and reloads it when `key` changes or the data changes anywhere.
 * `key` should include everything the loader depends on (e.g. the filters as JSON).
 */
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const { version } = useDataVersion();
  const runLoad = useEffectEvent(load); // always the latest loader, without re-running the effect
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let current = true;
    runLoad()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((e) => current && setState((s) => ({ data: s.data, error: String(e), loading: false })));
    return () => {
      current = false;
    };
  }, [key, version]);

  return state;
}
