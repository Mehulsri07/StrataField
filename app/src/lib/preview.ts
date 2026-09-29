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
  sections_list: () => [],
  soil_names_unlinked: () => [["Murrum", 3], ["Bajri", 1]],
  backups_list: () => [
    { fileName: "strata-preview-auto.db", path: "", createdAt: new Date().toISOString().slice(0, 10) + " 09:12:00", kind: "auto", label: "Automatic", sizeBytes: 212_992, borewellCount: SAMPLE_BOREWELLS.length, readable: true },
  ],
  borewells_search: (args) => {
    const f = (args.filters ?? {}) as SearchFilters;
    // The preview's Recycle bin shows two sample borewells as if they had been deleted.
    if (f.showDeleted) return SAMPLE_BOREWELLS.slice(-2).map((i, k) => ({ ...i, borewell: { ...i.borewell, deletedAt: `2026-09-2${k + 5}T11:4${k}:00` } }));
    const q = (f.query ?? "").trim().toLowerCase();
    const within = (v: number | null, min?: number, max?: number) => (min == null || (v != null && v >= min)) && (max == null || (v != null && v <= max));
    return SAMPLE_BOREWELLS.filter(({ borewell: b, strata }) =>
      (!q || [b.borewellId, b.ownerName, b.area, b.project].join(" ").toLowerCase().includes(q)) &&
      (!f.project || b.project === f.project) &&
      (!f.materialId || strata.some((l) => l.materialId === f.materialId)) &&
      within(b.totalDepth, f.minDepth, f.maxDepth) &&
      within(b.waterLevel, f.minWaterLevel, f.maxWaterLevel) &&
      (!f.dateFrom || b.date >= f.dateFrom) && (!f.dateTo || b.date <= f.dateTo) &&
      (!f.noLocation || b.latitude == null),
    );
  },
  projects_list: () => [...new Set(SAMPLE_BOREWELLS.map((i) => i.borewell.project))].sort().map((name) => ({
    id: name, name, description: "", createdAt: "", updatedAt: "",
    borewellCount: SAMPLE_BOREWELLS.filter((i) => i.borewell.project === name).length,
  })),
  borewell_get: (args) => {
    const item = SAMPLE_BOREWELLS.find((i) => i.borewell.id === args.id);
    if (!item) throw new Error("This borewell was not found. It may have been deleted.");
    const b = item.borewell;
    return {
      ...item,
      pipes: samplePipes(item),
      waterReadings: b.waterLevel == null ? [] : [
        { id: `${b.id}-w1`, borewellId: b.id, measuredOn: b.date, staticLevel: b.waterLevel, dynamicLevel: null, source: "When drilled", remarks: "" },
      ],
      photos: [],
      files: b.importMethod === "excel" ? [{ id: `${b.id}-f1`, borewellId: b.id, kind: "excel", filePath: "", originalName: "field-logs.xlsx", createdAt: b.createdAt }] : [],
      history: [
        { id: 2, entity: "borewell", entityId: b.id, action: "update", changedAt: b.updatedAt, summary: `Saved ${item.strata.length} soil layers for ${b.borewellId}` },
        { id: 1, entity: "borewell", entityId: b.id, action: b.importMethod === "excel" ? "import" : "create", changedAt: b.createdAt, summary: `Added ${b.borewellId} (${b.ownerName})` },
      ],
    };
  },
};

export async function previewCommand<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const handler = handlers[command];
  if (!handler) {
    throw new Error("This action works in the StrataField app, not in the browser preview.");
  }
  return handler(args) as T;
}
