import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_MATERIALS } from "@strata/core";
import { Button } from "@/components/ui/button";

interface AppInfo {
  name: string;
  version: string;
}

// T0 placeholder: proves the three layers are wired together
// (React screen → Rust backend via invoke, and the shared @strata/core package).
// Replaced by the real app shell in T2.
function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppInfo>("app_info")
      .then(setInfo)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold">StrataField</h1>
      <p className="text-muted-foreground">
        The new app is being built. This screen checks that everything is connected.
      </p>
      <ul className="grid gap-1 text-sm">
        <li>
          Backend:{" "}
          {info ? `${info.name} ${info.version}` : error ? `not reachable (${error})` : "checking…"}
        </li>
        <li>Shared logic: {DEFAULT_MATERIALS.length} soil types loaded</li>
      </ul>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Check again
      </Button>
    </main>
  );
}

export default App;
