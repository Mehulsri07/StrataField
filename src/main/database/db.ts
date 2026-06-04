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
  }

  dbInstance.run(CREATE_TABLES_SQL);
  populateDefaultMaterials(dbInstance);

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
    const stmt = db.prepare('INSERT OR IGNORE INTO materials (id, name, color, pattern, is_custom) VALUES (?, ?, ?, ?, 0)');
    for (const m of DEFAULT_MATERIALS) {
      stmt.run([m.id, m.name, m.color, m.pattern]);
    }
    stmt.free();
    db.run('COMMIT');
    saveDatabase();
  } catch (err) {
    try { db.run('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('Failed to populate default materials dictionary:', err);
  }
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
        remarks, date, created_at, updated_at, import_source, import_method, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of oldBorewells) {
      insertBorewellStmt.run([
        b.id, b.borewellId, 'Default Project', b.ownerName,
        b.houseNo || null, b.area || null, b.city, b.address || null,
        b.latitude ?? null, b.longitude ?? null, b.boreDia ?? null,
        b.pipeDia ?? null, b.totalDepth ?? null, b.waterLevel ?? null,
        b.remarks || '', b.date, b.createdAt, b.updatedAt, null, 'manual', null
      ]);
    }
    insertBorewellStmt.free();

    const insertStrataStmt = db.prepare(`
      INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, color, pattern, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of oldStrata) {
      insertStrataStmt.run([s.id, s.borewellId, s.startDepth, s.endDepth, s.material, s.color, s.pattern, s.remarks || '']);
    }
    insertStrataStmt.free();

    const insertPipeStmt = db.prepare(`
      INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of oldPipes) {
      insertPipeStmt.run([p.id, p.borewellId, p.startDepth, p.endDepth, p.pipeType]);
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
