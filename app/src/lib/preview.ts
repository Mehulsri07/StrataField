/**
 * Browser-preview answers for a few read-only commands, using sample data.
 * Loaded only when the screens run outside the app (see `isPreview` in api.ts).
 */
import type { SearchFilters, StartupStatus } from "@strata/core";
import { DEFAULT_MATERIALS } from "@strata/core";
import { SAMPLE_BOREWELLS, samplePipes } from "./sample";

const startup: StartupStatus = {
  dataFolder: "Browser preview (sample data)",
  open: { path: "preview", schemaVersion: 1, previousVersion: 1, created: false, upgradeBackup: null },
  legacyImport: null,
  legacyImportError: null,
  automaticBackup: null,
  error: null,
};

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  app_info: () => ({ name: "StrataField", version: "preview" }),
  startup_status: () => startup,
  data_version: () => 1,
  materials_list: () => DEFAULT_MATERIALS,
  backups_list: () => [
    { fileName: "strata-preview-auto.db", path: "", createdAt: new Date().toISOString().slice(0, 10) + " 09:12:00", kind: "auto", label: "Automatic", sizeBytes: 212_992, borewellCount: SAMPLE_BOREWELLS.length, readable: true },
  ],
  borewells_search: (args) => {
    const f = (args.filters ?? {}) as SearchFilters;
    const q = (f.query ?? "").trim().toLowerCase();
    return SAMPLE_BOREWELLS.filter(({ borewell: b }) =>
      (!q || [b.borewellId, b.ownerName, b.area, b.project].join(" ").toLowerCase().includes(q)) &&
      (!f.noLocation || b.latitude == null) &&
      !f.showDeleted,
    );
  },
  borewell_get: (args) => {
    const item = SAMPLE_BOREWELLS.find((i) => i.borewell.id === args.id);
    if (!item) throw new Error("This borewell was not found. It may have been deleted.");
    return { ...item, pipes: samplePipes(item), waterReadings: [], photos: [], files: [], history: [] };
  },
};

export async function previewCommand<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const handler = handlers[command];
  if (!handler) {
    throw new Error("This action works in the StrataField app, not in the browser preview.");
  }
  return handler(args) as T;
}
