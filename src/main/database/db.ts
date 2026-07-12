import type SqlJsType from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { CREATE_TABLES_SQL } from './schema';
import { DEFAULT_MATERIALS } from '../../shared/constants';

let dbInstance: SqlJsType.Database | null = null;
let dbPath = '';

/**
 * Loads the sql.js initializer function.
 *
 * In the packaged .exe, Vite/asar does NOT include node_modules — only the
 * compiled .vite/build/* files are in the asar. The top-level
 * `import initSqlJs from 'sql.js'` would cause Rollup to emit
 * `require('sql.js')` which fails at runtime because sql.js is not present.
 *
 * Instead we copy sql-wasm.js into resources/ via forge.config.ts
 * extraResource and load it with an absolute path require() that bypasses
 * the asar entirely. In dev mode we use the normal dynamic import.
 */
async function loadSqlJs(): Promise<typeof SqlJsType> {
  if (app.isPackaged) {
    const sqlJsPath = path.join(process.resourcesPath, 'sql-wasm.js');
    // require() with an absolute path works outside the asar
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(sqlJsPath) as typeof SqlJsType;
  } else {
    return (await import('sql.js')).default;
  }
}

export async function initDatabase(): Promise<void> {
  if (dbInstance) return;

  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'stratafield.db');

  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : require.resolve('sql.js/dist/sql-wasm.wasm');

  const wasmBinary = fs.readFileSync(wasmPath);
  const initSqlJs = await loadSqlJs();
  const SQL = await initSqlJs({ wasmBinary: wasmBinary as any });

  let fileBuffer: Buffer | null = null;
  if (fs.existsSync(dbPath)) {
    try {
      fileBuffer = fs.readFileSync(dbPath);
    } catch (err) {
      console.error('Failed to read database file, initializing fresh DB:', err);
    }
  }

  dbInstance = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  if (fileBuffer) {
    migrateDatabaseSchema(dbInstance);
    migrateNewColumns(dbInstance);
  }

  dbInstance.run(CREATE_TABLES_SQL);
  populateDefaultMaterials(dbInstance);

  // Backfill material_id for existing strata_layers
  backfillMaterialIds(dbInstance);

  if (!fileBuffer) {
    saveDatabase();
  }
}

export function getDb(): SqlJsType.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Please call initDatabase() first.');
  }
  return dbInstance;
}

export function saveDatabase(): void {
  if (!dbInstance || !dbPath) return;
  try {
    const binaryArray = dbInstance.export();
    fs.writeFileSync(dbPath, Buffer.from(binaryArray));
  } catch (err) {
    console.error('Failed to save SQLite database file:', err);
  }
}

export async function reloadDatabase(buffer: Buffer): Promise<void> {
  try {
    if (dbInstance) {
      try { dbInstance.close(); } catch (e) {
        console.warn('Error closing existing database instance:', e);
      }
    }

    fs.writeFileSync(dbPath, buffer);

    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : require.resolve('sql.js/dist/sql-wasm.wasm');

    const wasmBinary = fs.readFileSync(wasmPath);
    const initSqlJs = await loadSqlJs();
    const SQL = await initSqlJs({ wasmBinary: wasmBinary as any });

    dbInstance = new SQL.Database(buffer);
    dbInstance.run(CREATE_TABLES_SQL);
    console.log('Database reloaded successfully from backup buffer.');
  } catch (err) {
    console.error('Failed to reload database from buffer:', err);
    throw err;
  }
}

export function mapResultToObjects<T>(result: SqlJsType.QueryExecResult[]): T[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      const camelKey = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      obj[camelKey] = row[idx];
    });
    return obj as T;
  });
}

function populateDefaultMaterials(db: SqlJsType.Database): void {
  try {
    console.log('Database Sync: Syncing central materials dictionary with default geological values...');
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM materials WHERE is_custom = 0');
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO materials (id, name, color, pattern, is_custom, lithology_class, lithology_family) VALUES (?, ?, ?, ?, 0, ?, ?)'
    );
    for (const m of DEFAULT_MATERIALS) {
      stmt.run([m.id, m.name, m.color, m.pattern, m.lithologyClass || null, m.lithologyFamily || null]);
    }
    stmt.free();
    db.run('COMMIT');
    saveDatabase();
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('Failed to populate default materials dictionary:', err);
  }
}

/**
 * Backfills material_id for strata_layers that have a material name matching the materials dictionary
 * but no material_id set yet. Runs every boot to catch new dictionary entries.
 */
function backfillMaterialIds(db: SqlJsType.Database): void {
  try {
    const result = db.exec(`
      SELECT COUNT(*) as cnt FROM strata_layers
      WHERE material_id IS NULL AND material IS NOT NULL AND material != ''
    `);
    const unmappedCount = result.length > 0 ? (result[0].values[0][0] as number) : 0;
    if (unmappedCount === 0) return;

    console.log(`Database Sync: Backfilling material_id for ${unmappedCount} unmapped strata layers...`);
    db.run(`
      UPDATE strata_layers
      SET material_id = (
        SELECT id FROM materials
        WHERE LOWER(materials.name) = LOWER(strata_layers.material)
        LIMIT 1
      )
      WHERE material_id IS NULL
        AND EXISTS (
          SELECT 1 FROM materials
          WHERE LOWER(materials.name) = LOWER(strata_layers.material)
        )
    `);
    saveDatabase();
    console.log('Database Sync: material_id backfill complete.');
  } catch (err) {
    console.error('Failed to backfill material_id:', err);
  }
}

/**
 * Migrates new columns added in Phase 1/2 onto existing databases.
 * Uses ALTER TABLE ADD COLUMN which is safe to repeat (column existence is checked first).
 */
function migrateNewColumns(db: SqlJsType.Database): void {
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    try {
      const info = db.exec(`PRAGMA table_info(${table})`);
      if (info.length === 0) return; // table doesn't exist yet
      const cols = info[0].values.map(row => row[1] as string);
      if (!cols.includes(column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Migration: Added ${table}.${column}`);
      }
    } catch (err) {
      console.error(`Migration: Failed to add ${table}.${column}:`, err);
    }
  };

  // borewells
  addColumnIfMissing('borewells', 'drilling_method', "TEXT CHECK(drilling_method IN ('ROTARY','DTH','MANUAL','UNKNOWN') OR drilling_method IS NULL)");
  addColumnIfMissing('borewells', 'depth_unit', "TEXT NOT NULL DEFAULT 'ft' CHECK(depth_unit IN ('ft','m'))");

  // strata_layers
  addColumnIfMissing('strata_layers', 'material_id', 'TEXT REFERENCES materials(id)');

  // pipe_assemblies
  addColumnIfMissing('pipe_assemblies', 'pipe_subtype', "TEXT CHECK(pipe_subtype IN ('PLAIN','RIBBED_SCREEN','SLOTTED','MS_SLOTTED') OR pipe_subtype IS NULL)");

  // materials
  addColumnIfMissing('materials', 'lithology_class', "TEXT CHECK(lithology_class IN ('CLAY','SILTY_CLAY','SANDY_CLAY','SILT','KANKAR','FINE_SAND','MEDIUM_SAND','COARSE_SAND','YELLOW_SAND','GRAVEL','SANDY_GRAVEL','FILL','ROCK','OTHER') OR lithology_class IS NULL)");
  addColumnIfMissing('materials', 'lithology_family', "TEXT CHECK(lithology_family IN ('CLAY','SAND','OTHER') OR lithology_family IS NULL)");

  saveDatabase();
}

function migrateDatabaseSchema(db: SqlJsType.Database): void {
  try {
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='borewells'");
    if (tableCheck.length === 0) return;

    const tableInfo = db.exec("PRAGMA table_info(borewells)");
    if (tableInfo.length === 0) return;

    const columns = tableInfo[0].values.map(row => row[1] as string);
    if (!columns.includes('ownerName')) return;

    console.log('Database Migration: Old camelCase schema detected. Migrating to snake_case...');

    const oldBorewells = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM borewells"));
    const oldStrata = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM strata_layers"));
    const oldPipes = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM pipe_assemblies"));

    let oldPhotos: any[] = [];
    try { oldPhotos = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM photos")); } catch (e) { /* */ }

    let oldFiles: any[] = [];
    try { oldFiles = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM files")); } catch (e) { /* */ }

    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN TRANSACTION');
    db.run('DROP TABLE IF EXISTS strata_layers');
    db.run('DROP TABLE IF EXISTS pipe_assemblies');
    db.run('DROP TABLE IF EXISTS photos');
    db.run('DROP TABLE IF EXISTS files');
    db.run('DROP TABLE IF EXISTS borewells');
    db.run(CREATE_TABLES_SQL);

    const insertBorewellStmt = db.prepare(`
      INSERT INTO borewells (
        id, borewell_id, project, owner_name, house_no, area, city, address,
        latitude, longitude, bore_dia, pipe_dia, total_depth, water_level,
        remarks, date, created_at, updated_at, import_source, import_method, deleted_at,
        drilling_method, depth_unit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of oldBorewells) {
      insertBorewellStmt.run([
        b.id, b.borewellId, 'Default Project', b.ownerName,
        b.houseNo || null, b.area || null, b.city, b.address || null,
        b.latitude ?? null, b.longitude ?? null, b.boreDia ?? null,
        b.pipeDia ?? null, b.totalDepth ?? null, b.waterLevel ?? null,
        b.remarks || '', b.date, b.createdAt, b.updatedAt, null, 'manual', null,
        null, 'ft'
      ]);
    }
    insertBorewellStmt.free();

    const insertStrataStmt = db.prepare(`
      INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, material_id, color, pattern, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of oldStrata) {
      insertStrataStmt.run([s.id, s.borewellId, s.startDepth, s.endDepth, s.material, null, s.color, s.pattern, s.remarks || '']);
    }
    insertStrataStmt.free();

    const insertPipeStmt = db.prepare(`
      INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type, pipe_subtype)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const p of oldPipes) {
      insertPipeStmt.run([p.id, p.borewellId, p.startDepth, p.endDepth, p.pipeType, null]);
    }
    insertPipeStmt.free();

    const insertPhotoStmt = db.prepare(`INSERT INTO photos (id, borewell_id, file_path, capture_date) VALUES (?, ?, ?, ?)`);
    for (const ph of oldPhotos) {
      insertPhotoStmt.run([ph.id, ph.borewellId, ph.filePath, ph.captureDate || null]);
    }
    insertPhotoStmt.free();

    const insertFileStmt = db.prepare(`INSERT INTO files (id, borewell_id, excel_path, pdf_path) VALUES (?, ?, ?, ?)`);
    for (const f of oldFiles) {
      insertFileStmt.run([f.id, f.borewellId, f.excelPath || null, f.pdfPath || null]);
    }
    insertFileStmt.free();

    db.run('COMMIT');
    db.run('PRAGMA foreign_keys = ON');
    console.log('Database Migration: Completed successfully.');
    saveDatabase();
  } catch (err) {
    try { db.run('ROLLBACK'); db.run('PRAGMA foreign_keys = ON'); } catch (re) { /* */ }
    console.error('Database Migration FAILED, rolled back:', err);
    throw err;
  }
}

function mapResultToObjectsCamelDirect<T = any>(result: SqlJsType.QueryExecResult[]): T[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => { obj[col] = row[idx]; });
    return obj as T;
  });
}
