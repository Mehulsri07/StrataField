// Made-up test files, built fresh for every run. No real client data is used.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as xlsx from "xlsx";
import { repo } from "./harness.mjs";

/** What the made-up older-app database contains; the tests check it all arrives. */
export const LEGACY = {
  borewellId: "BW-OLD-001",
  owner: "Asha Verma",
  layers: 12,
  pipes: 4,
  inRecycleBin: 1,
  orphanLayers: 2,
  orphanPipes: 2,
  unmatchedName: "Murrum",
};

/**
 * An older StrataField (Electron) database, in the format the owner's real one uses: one borewell
 * with 12 layers, 4 pipe pieces and a water level; one in the Recycle bin; layers and pipes left over
 * from borewells deleted long ago; and a soil name ("Murrum") that matches no soil type.
 */
function legacyDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE borewells (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, project TEXT NOT NULL, owner_name TEXT NOT NULL,
      house_no TEXT, area TEXT, city TEXT NOT NULL, address TEXT, latitude REAL, longitude REAL, bore_dia REAL, pipe_dia REAL,
      total_depth REAL, water_level REAL, remarks TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      import_source TEXT, import_method TEXT, deleted_at TEXT);
    CREATE TABLE strata_layers (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, start_depth REAL NOT NULL, end_depth REAL NOT NULL,
      material TEXT NOT NULL, color TEXT NOT NULL, pattern TEXT NOT NULL, remarks TEXT);
    CREATE TABLE pipe_assemblies (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, start_depth REAL NOT NULL, end_depth REAL NOT NULL,
      pipe_type TEXT NOT NULL);
    CREATE TABLE photos (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, file_path TEXT NOT NULL, capture_date TEXT);
    CREATE TABLE files (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, excel_path TEXT, pdf_path TEXT);
    CREATE TABLE materials (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, pattern TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0);
  `);
  const bw = db.prepare(`INSERT INTO borewells (id, borewell_id, project, owner_name, area, city, latitude, longitude, bore_dia, pipe_dia,
    total_depth, water_level, remarks, date, created_at, updated_at, import_method, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  bw.run("b1", LEGACY.borewellId, "Default Project", LEGACY.owner, "Chowk", "Lucknow", null, null, 10, 6, 240, 116, "", "2025-02-01", "2025-02-01T00:00:00Z", "2025-02-01T00:00:00Z", "manual", null);
  bw.run("b2", "BW-OLD-002", "Zone 5", "Ravi Kumar", "Alambagh", "Lucknow", null, null, 8, 5, 200, 102, "", "2025-03-01", "2025-03-01T00:00:00Z", "2025-03-01T00:00:00Z", "manual", "2025-04-01T00:00:00Z");

  const layer = db.prepare("INSERT INTO strata_layers VALUES (?,?,?,?,?,?,?,?)");
  const names = ["Clay", "Kankar", "Clay", "Fine Sand", "medium sand", "Clay", LEGACY.unmatchedName, "Coarse Sand", "Clay", "Gravel", "Clay", "Coarse Sand"];
  names.forEach((name, i) => layer.run(`s${i}`, "b1", i * 20, i * 20 + 20, name, "#999999", "dots", ""));
  layer.run("s-bin", "b2", 0, 50, "Clay", "#8B6914", "lines", "");
  for (let i = 0; i < LEGACY.orphanLayers; i++) layer.run(`s-gone${i}`, "gone", 0, 10, "Clay", "#8B6914", "lines", "");

  const pipe = db.prepare("INSERT INTO pipe_assemblies VALUES (?,?,?,?,?)");
  [[0, 80, "plain"], [80, 140, "slotted"], [140, 200, "plain"], [200, 240, "slotted"]].forEach(([a, b, t], i) => pipe.run(`p${i}`, "b1", a, b, t));
  for (let i = 0; i < LEGACY.orphanPipes; i++) pipe.run(`p-gone${i}`, "gone", 0, 10, "plain");

  db.prepare("INSERT INTO materials VALUES (?,?,?,?,?)").run("m_clay", "Clay", "#8B6914", "lines", 0);
  db.close();
}

/** An Excel drilling log in the standard field format, with only known soil names. */
function drillingLog(file) {
  const rows = [["Site Info"], ["Streta Chart"], ["G.L."]];
  const soil = ["Clay", "Clay", "Kankar", "Fine Sand", "Fine Sand", "Coarse Sand", "Clay", "Gravel", "Coarse Sand", "Coarse Sand"];
  soil.forEach((m, i) => rows.push([null, (i + 1) * 20, null, m, i < 5 ? "Plain" : "Slotted", null, null]));
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), "Sheet1");
  fs.writeFileSync(file, xlsx.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Builds every test file in `work` and returns their paths (forward slashes, for page scripts). */
export function buildFixtures(work) {
  const fwd = (p) => p.split(path.sep).join("/");
  const legacyRoot = path.join(work, "roaming");
  fs.mkdirSync(path.join(legacyRoot, "StrataField"), { recursive: true });
  legacyDatabase(path.join(legacyRoot, "StrataField", "stratafield.db"));

  const files = path.join(work, "files");
  fs.mkdirSync(files, { recursive: true });
  const log = path.join(files, "Aliganj site log.xlsx");
  drillingLog(log);
  // A photo taken at 26.8947 N, 80.9450 E (the GPS position is saved inside the picture).
  const photo = path.join(files, "site-photo.jpg");
  fs.copyFileSync(path.join(repo, "e2e", "fixtures", "site-photo.jpg"), photo);
  const pdf = path.join(files, "site-notes.pdf");
  fs.writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

  return {
    dataDir: path.join(work, "Strata"),
    legacyRoot,
    log: fwd(log),
    photo: fwd(photo),
    pdf: fwd(pdf),
    saved: path.join(work, "saved"),
  };
}
