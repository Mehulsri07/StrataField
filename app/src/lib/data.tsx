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

/** How many loads are kept at once; past this, the one used longest ago is dropped. */
const KEEP = 20;

/**
 * What has been loaded since the data last changed, by key. Screens asking for the same thing
 * share one load, and a screen opened again shows what is here straight away.
 */
const loads = new Map<string, { promise: Promise<unknown>; done: boolean; data: unknown }>();
let loadsVersion = 0;

/** Runs `load` once per key until the data changes; everyone else asking gets the same answer. */
export function loadShared<T>(key: string, version: number, load: () => Promise<T>): Promise<T> {
  if (version !== loadsVersion) {
    loads.clear(); // the data changed, so everything loaded before is out of date
    loadsVersion = version;
  }
  let entry = loads.get(key);
  if (entry) {
    loads.delete(key); // put back below, as the most recently used
  } else {
    const started = { promise: load() as Promise<unknown>, done: false, data: null as unknown };
    started.promise.then(
      (data) => { started.data = data; started.done = true; },
      () => { if (loads.get(key) === started) loads.delete(key); }, // failed: the next one to ask tries again
    );
    entry = started;
  }
  loads.set(key, entry);
  if (loads.size > KEEP) loads.delete(loads.keys().next().value!);
  return entry.promise as Promise<T>;
}

/**
 * Loads data and reloads it when `key` changes or the data changes anywhere.
 * `key` should include everything the loader depends on (e.g. the filters as JSON), and nothing else
 * may use the same key for different data: the result is shared with every screen using that key.
 * Treat it as read-only (copy before sorting).
 */
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const { version } = useDataVersion();
  const runLoad = useEffectEvent(load); // always the latest loader, without re-running the effect
  const [state, setState] = useState<Loaded<T>>(() => {
    const had = version === loadsVersion ? loads.get(key) : undefined;
    return had?.done ? { data: had.data as T, error: null, loading: false } : { data: null, error: null, loading: true };
  });

  useEffect(() => {
    let current = true;
    loadShared(key, version, () => runLoad())
      // Already showing exactly this (a screen opened again): nothing to draw again.
      .then((data) => current && setState((s) => (s.data === data && !s.error && !s.loading ? s : { data, error: null, loading: false })))
      .catch((e) => current && setState((s) => ({ data: s.data, error: String(e), loading: false })));
    return () => {
      current = false;
    };
  }, [key, version]);

  return state;
}

/** The key the whole borewell list is loaded under, by every screen that needs it. */
export const ALL_BOREWELLS = "borewells";
const allBorewells = () => api.borewells.search();

/** Every borewell with its layers: loaded once however many screens (and the sidebar) use it. */
export const useBorewells = () => useLoad(ALL_BOREWELLS, allBorewells);
/** The same shared list, for code outside a screen's `useLoad` (the sidebar counts). */
export const loadBorewells = (version: number) => loadShared(ALL_BOREWELLS, version, allBorewells);
