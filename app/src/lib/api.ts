/**
 * Typed wrappers around the Rust commands in `app/src-tauri/src/commands.rs`.
 * Screens call these instead of `invoke` directly. Errors reject with a plain-language
 * message that can be shown to the user as-is.
 */
import { convertFileSrc, invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";
import type {
  Attachment, BackupInfo, Borewell, BorewellInput, BorewellListItem, BorewellRecord, ImportRequest,
  ImportResult, LegacyImportReport, Material, Photo, PipeSegment, Project, SearchFilters, Section,
  StartupStatus, StrataLayer, WaterReading, GeocodeResult,
} from "@strata/core";

export interface SecondCopy {
  /** The folder the user chose; null when backups are only on this computer. */
  folder: string | null;
  /** Local time, "YYYY-MM-DD HH:MM:SS". */
  lastCopiedAt: string | null;
  /** Why the last copy failed; null after a success. */
  lastError: string | null;
}

export interface OfflineMapStatus {
  installed: boolean;
  sizeBytes: number;
  /** Local time, "YYYY-MM-DD HH:MM:SS". */
  downloadedAt: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
}

/** True when the screens run in a normal browser (design preview) instead of inside the app. */
export const isPreview = !isTauri();

/**
 * Calls a Rust command. In the browser preview, answers from sample data instead, so screens can be
 * reviewed without the app; commands the preview does not support reject with a clear message.
 */
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isPreview) {
    try {
      return await tauriInvoke<T>(command, args);
    } catch (e) {
      // Kept in the log on this computer, for "Copy details for support".
      if (command !== "log_error") logError(command, e);
      throw e;
    }
  }
  const { previewCommand } = await import("./preview");
  return previewCommand<T>(command, args);
}

/** Writes a problem to the log on this computer (never fails, never sends anything anywhere). */
export function logError(source: string, error: unknown) {
  if (isPreview) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  tauriInvoke("log_error", { source, message }).catch(() => {});
}

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  startupStatus: () => invoke<StartupStatus>("startup_status"),
  /** Changes when another Strata app writes to the shared database. */
  dataVersion: () => invoke<number>("data_version"),

  borewells: {
    search: (filters: SearchFilters = {}) => invoke<BorewellListItem[]>("borewells_search", { filters }),
    get: (id: string) => invoke<BorewellRecord>("borewell_get", { id }),
    create: (input: BorewellInput) => invoke<Borewell>("borewell_create", { input }),
    update: (id: string, input: BorewellInput) => invoke<Borewell>("borewell_update", { id, input }),
    /** Moves to the Recycle bin. */
    remove: (id: string) => invoke<void>("borewell_delete", { id }),
    restore: (id: string) => invoke<void>("borewell_restore", { id }),
    deletePermanently: (id: string) => invoke<void>("borewell_delete_permanently", { id }),
  },

  strata: {
    save: (borewellId: string, layers: Partial<StrataLayer>[]) => invoke<StrataLayer[]>("strata_save", { borewellId, layers }),
  },
  pipes: {
    save: (borewellId: string, pipes: Partial<PipeSegment>[]) => invoke<PipeSegment[]>("pipes_save", { borewellId, pipes }),
  },
  water: {
    add: (borewellId: string, reading: Partial<WaterReading>) => invoke<WaterReading>("water_reading_add", { borewellId, reading }),
    remove: (id: string) => invoke<void>("water_reading_delete", { id }),
  },

  materials: {
    list: () => invoke<Material[]>("materials_list"),
    create: (material: Material) => invoke<Material>("material_create", { material }),
    update: (material: Material) => invoke<Material>("material_update", { material }),
    remove: (id: string) => invoke<void>("material_delete", { id }),
  },
  projects: {
    list: () => invoke<Project[]>("projects_list"),
  },

  attachments: {
    addPhoto: (borewellId: string, sourcePath: string, extra: { captureDate?: string; latitude?: number; longitude?: number; caption?: string } = {}) =>
      invoke<Photo>("photo_add", { borewellId, sourcePath, ...extra }),
    addFile: (borewellId: string, sourcePath: string) => invoke<Attachment>("file_add", { borewellId, sourcePath }),
    remove: (kind: "photo" | "file", id: string) => invoke<void>("attachment_remove", { kind, id }),
  },

  importExcel: (request: ImportRequest) => invoke<ImportResult>("import_save", { request }),

  soilNames: {
    /** Soil names on layers that are not linked to a soil type: [name, number of layers]. */
    unlinked: () => invoke<[string, number][]>("soil_names_unlinked"),
    link: (name: string, materialId: string) => invoke<number>("soil_name_link", { name, materialId }),
  },

  sections: {
    list: () => invoke<Section[]>("sections_list"),
    save: (section: Section) => invoke<Section>("section_save", { section }),
    remove: (id: string) => invoke<void>("section_delete", { id }),
  },

  backups: {
    list: () => invoke<BackupInfo[]>("backups_list"),
    create: () => invoke<BackupInfo>("backup_create"),
    /** Resolves with the safety backup taken before restoring. */
    restore: (path: string) => invoke<BackupInfo>("backup_restore", { path }),
    importFromOlderVersion: (path: string) => invoke<LegacyImportReport>("legacy_import", { path }),
    /** A second copy of every backup in a folder the user chose (USB drive, cloud folder). */
    secondCopy: {
      get: () => invoke<SecondCopy>("backup_second_copy_get"),
      /** `null` stops copying. Copies the newest backup straight away. */
      set: (folder: string | null) => invoke<SecondCopy>("backup_second_copy_set", { folder }),
      now: () => invoke<SecondCopy>("backup_second_copy_now"),
    },
    /** Opens the backups folder or the whole data folder in File Explorer. */
    openFolder: (which: "backups" | "data") => invoke<void>("open_folder", { which }),
  },

  settings: {
    get: <T>(key: string) => invoke<T | null>("setting_get", { key }),
    set: (key: string, value: unknown) => invoke<void>("setting_set", { key, value }),
  },

  /** Approximate location for an address. Needs internet; resolves null when nothing is found. */
  geocode: (query: string) => invoke<GeocodeResult | null>("geocode_address", { query }),

  /** The bytes of an Excel or CSV file the user chose. */
  readSpreadsheet: (path: string) => invoke<ArrayBuffer>("read_spreadsheet", { path }),

  /** Versions, counts, backup status and recent errors, for "Copy details for support". */
  supportDetails: () => invoke<string>("support_details"),

  /** Opens the getting-started guide installed with the app, in the web browser. */
  openGuide: () => invoke<void>("open_guide"),

  /** The Lucknow map file for use without internet (downloaded from Settings). */
  offlineMap: {
    status: () => invoke<OfflineMapStatus>("offline_map_status"),
    /** Progress arrives as "offline-map-progress" events ({ received, total }). */
    download: () => invoke<OfflineMapStatus>("offline_map_download"),
    remove: () => invoke<void>("offline_map_remove"),
    read: (offset: number, length: number) => invoke<ArrayBuffer>("offline_map_read", { offset, length }),
  },

  /** Date and GPS position saved inside a photo (empty when the camera saved none). */
  photoMetadata: (path: string) =>
    invoke<{ captureDate: string | null; latitude: number | null; longitude: number | null }>("photo_metadata", { path }),
};

/** The end-to-end test stands in for the file and folder pickers, only in builds made for it. */
const testChooser = () =>
  import.meta.env.VITE_E2E === "1" ? (window as { __STRATA_TEST_CHOOSE__?: (title: string) => string[] }).__STRATA_TEST_CHOOSE__ : undefined;

/** Files on this computer: choosing, opening and showing them. */
export const files = {
  /** Asks the user to choose files. Resolves to their paths ([] if they cancel). */
  async choose(options: { title: string; multiple?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string[]> {
    const testPick = testChooser();
    if (testPick) return testPick(options.title);
    if (isPreview) throw new Error("Choosing files works in the StrataField app, not in the browser preview.");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ title: options.title, multiple: options.multiple ?? false, filters: options.filters, directory: false });
    if (!picked) return [];
    return Array.isArray(picked) ? picked : [picked];
  },
  /** Asks the user to choose a folder. Resolves to its path, or null if they cancel. */
  async chooseFolder(title: string): Promise<string | null> {
    const testPick = testChooser();
    if (testPick) return testPick(title)[0] ?? null;
    if (isPreview) throw new Error("Choosing folders works in the StrataField app, not in the browser preview.");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ title, directory: true, multiple: false });
    return typeof picked === "string" ? picked : null;
  },
  /** Opens a stored file (PDF, Excel…) in its usual program. */
  async open(path: string): Promise<void> {
    if (isPreview) throw new Error("Opening files works in the StrataField app, not in the browser preview.");
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(path);
  },
  /** URL for showing a stored photo in the app. */
  src: (path: string) => (isPreview ? "" : convertFileSrc(path)),
  photoFilters: [{ name: "Photos", extensions: ["jpg", "jpeg", "png", "heic", "webp"] }],
  documentFilters: [{ name: "Documents", extensions: ["pdf", "xlsx", "xls", "xlsm", "csv", "doc", "docx"] }],
  excelFilters: [{ name: "Excel drilling logs", extensions: ["xlsx", "xls", "xlsm", "csv"] }],
};
