import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { CREATE_TABLES_SQL } from './schema';
import { DEFAULT_MATERIALS } from '../../shared/constants';

let dbInstance: initSqlJs.Database | null = null;
let dbPath = '';

export async function initDatabase(): Promise<void> {
  if (dbInstance) return;

  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'stratafield.db');

  let wasmPath = '';
  if (app.isPackaged) {
    wasmPath = path.join(process.resourcesPath, 'sql-wasm.wasm');
  } else {
    // In dev mode, resolve using Node require resolution
    wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  }

  const wasmBinary = fs.readFileSync(wasmPath);
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

  // Run schema migration if old tables exist
  if (fileBuffer) {
    migrateDatabaseSchema(dbInstance);
  }

  // Execute standard tables schema and indexes setup
  dbInstance.run(CREATE_TABLES_SQL);

  // Pre-populate materials table with default values if empty
  populateDefaultMaterials(dbInstance);

  // If new DB file was created, serialize it to disk immediately
  if (!fileBuffer) {
    saveDatabase();
  }
}

export function getDb(): initSqlJs.Database {
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
      try {
        dbInstance.close();
      } catch (e) {
        console.warn('Error closing existing database instance:', e);
      }
    }

    // Overwrite the file on disk
    fs.writeFileSync(dbPath, buffer);

    // Initialize fresh SQL.js instance from the active wasm
    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : require.resolve('sql.js/dist/sql-wasm.wasm');
    
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary: wasmBinary as any });
    
    dbInstance = new SQL.Database(buffer);
    dbInstance.run(CREATE_TABLES_SQL);
    console.log('Database reloaded successfully from backup buffer.');
  } catch (err) {
    console.error('Failed to reload database from buffer:', err);
    throw err;
  }
}

export function mapResultToObjects<T>(result: initSqlJs.QueryExecResult[]): T[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      // Convert database snake_case keys to camelCase keys for frontend
      const camelKey = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      obj[camelKey] = row[idx];
    });
    return obj as T;
  });
}

function populateDefaultMaterials(db: initSqlJs.Database): void {
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
    try { db.run('ROLLBACK'); } catch (e) { /* ignore rollback failure */ }
    console.error('Failed to populate default materials dictionary:', err);
  }
}

function migrateDatabaseSchema(db: initSqlJs.Database): void {
  try {
    // Check if table borewells exists
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='borewells'");
    if (tableCheck.length === 0) {
      return;
    }

    // Check if old camelCase column exists
    const tableInfo = db.exec("PRAGMA table_info(borewells)");
    if (tableInfo.length === 0) return;

    const columns = tableInfo[0].values.map(row => row[1] as string);
    const hasCamelCase = columns.includes('ownerName');

    if (!hasCamelCase) {
      // Already migrated or snake_case
      return;
    }

    console.log('Database Migration: Old camelCase database schema detected. Running safe schema migration to snake_case...');

    // 1. Read all existing records
    const oldBorewells = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM borewells"));
    const oldStrata = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM strata_layers"));
    const oldPipes = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM pipe_assemblies"));
    
    let oldPhotos: any[] = [];
    try {
      oldPhotos = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM photos"));
    } catch (e) {
      // Table photos may not exist in older versions
    }

    let oldFiles: any[] = [];
    try {
      oldFiles = mapResultToObjectsCamelDirect<any>(db.exec("SELECT * FROM files"));
    } catch (e) {
      // Table files may not exist in older versions
    }

    // Disable foreign keys check temporarily
    db.run('PRAGMA foreign_keys = OFF');
    db.run('BEGIN TRANSACTION');

    // 2. Drop old tables
    db.run('DROP TABLE IF EXISTS strata_layers');
    db.run('DROP TABLE IF EXISTS pipe_assemblies');
    db.run('DROP TABLE IF EXISTS photos');
    db.run('DROP TABLE IF EXISTS files');
    db.run('DROP TABLE IF EXISTS borewells');

    // 3. Re-create new snake_case tables
    db.run(CREATE_TABLES_SQL);

    // 4. Map and insert Borewells
    const insertBorewellStmt = db.prepare(`
      INSERT INTO borewells (
        id, borewell_id, project, owner_name, house_no, area, city, address,
        latitude, longitude, bore_dia, pipe_dia, total_depth, water_level,
        remarks, date, created_at, updated_at, import_source, import_method, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of oldBorewells) {
      insertBorewellStmt.run([
        b.id,
        b.borewellId,
        'Default Project', // new default field value
        b.ownerName,
        b.houseNo || null,
        b.area || null,
        b.city,
        b.address || null,
        b.latitude !== undefined ? b.latitude : null,
        b.longitude !== undefined ? b.longitude : null,
        b.boreDia !== undefined ? b.boreDia : null,
        b.pipeDia !== undefined ? b.pipeDia : null,
        b.totalDepth !== undefined ? b.totalDepth : null,
        b.waterLevel !== undefined ? b.waterLevel : null,
        b.remarks || '',
        b.date,
        b.createdAt,
        b.updatedAt,
        null,
        'manual',
        null
      ]);
    }
    insertBorewellStmt.free();

    // 5. Map and insert Strata
    const insertStrataStmt = db.prepare(`
      INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, color, pattern, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of oldStrata) {
      insertStrataStmt.run([
        s.id,
        s.borewellId,
        s.startDepth,
        s.endDepth,
        s.material,
        s.color,
        s.pattern,
        s.remarks || ''
      ]);
    }
    insertStrataStmt.free();

    // 6. Map and insert Pipes
    const insertPipeStmt = db.prepare(`
      INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of oldPipes) {
      insertPipeStmt.run([
        p.id,
        p.borewellId,
        p.startDepth,
        p.endDepth,
        p.pipeType
      ]);
    }
    insertPipeStmt.free();

    // 7. Map and insert Photos
    const insertPhotoStmt = db.prepare(`
      INSERT INTO photos (id, borewell_id, file_path, capture_date)
      VALUES (?, ?, ?, ?)
    `);
    for (const ph of oldPhotos) {
      insertPhotoStmt.run([
        ph.id,
        ph.borewellId,
        ph.filePath,
        ph.captureDate || null
      ]);
    }
    insertPhotoStmt.free();

    // 8. Map and insert Files
    const insertFileStmt = db.prepare(`
      INSERT INTO files (id, borewell_id, excel_path, pdf_path)
      VALUES (?, ?, ?, ?)
    `);
    for (const f of oldFiles) {
      insertFileStmt.run([
        f.id,
        f.borewellId,
        f.excelPath || null,
        f.pdfPath || null
      ]);
    }
    insertFileStmt.free();

    db.run('COMMIT');
    db.run('PRAGMA foreign_keys = ON');

    console.log('Database Migration: Successfully completed schema migration.');
    saveDatabase();
  } catch (err) {
    try {
      db.run('ROLLBACK');
      db.run('PRAGMA foreign_keys = ON');
    } catch (re) {
      // Ignore rollback errors if transaction was not active
    }
    console.error('Database Migration FAILED, schema changes rolled back:', err);
    throw err;
  }
}

// Special helper to parse results before column names are transformed
function mapResultToObjectsCamelDirect<T = any>(result: initSqlJs.QueryExecResult[]): T[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    return obj as T;
  });
}

