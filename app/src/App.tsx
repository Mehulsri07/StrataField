import { useEffect, useState } from "react";
import type { StartupStatus } from "@strata/core";
import { DEFAULT_MATERIALS } from "@strata/core";
import { api, type AppInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Placeholder until the real app shell (T2): shows that the screen, the Rust backend and the
// shared database are connected, and what start-up did with the user's data.
function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<StartupStatus | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.appInfo(), api.startupStatus()])
      .then(([i, s]) => {
        setInfo(i);
        setStatus(s);
        return s.error ? null : api.borewells.search();
      })
      .then((items) => items && setCount(items.length))
      .catch((err) => setError(String(err)));
  }, []);

  const legacy = status?.legacyImport;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold">StrataField</h1>
      <p className="text-muted-foreground">
        The new app is being built. This screen checks that everything is connected.
      </p>
      {error && <p className="text-destructive">Something went wrong: {error}</p>}
      <ul className="grid max-w-xl gap-1 text-sm">
        <li>Version: {info ? `${info.name} ${info.version}` : "checking…"}</li>
        <li>Soil types in the shared list: {DEFAULT_MATERIALS.length}</li>
        {status?.error ? (
          <li className="text-destructive">Your data could not be opened: {status.error}</li>
        ) : (
          <>
            <li>Your data is saved in: {status?.dataFolder ?? "checking…"}</li>
            <li>Borewells: {count ?? "checking…"}</li>
          </>
        )}
        {legacy && (
          <li>
            Brought over from the older StrataField: {legacy.borewells} borewells, {legacy.strataLayers} soil layers,{" "}
            {legacy.pipeSegments} pipe pieces.
          </li>
        )}
        {status?.legacyImportError && (
          <li className="text-destructive">Data from the older StrataField could not be brought over: {status.legacyImportError}</li>
        )}
        {status?.automaticBackup && <li>A backup of your data was saved today.</li>}
      </ul>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Check again
      </Button>
    </main>
  );
}

export default App;
