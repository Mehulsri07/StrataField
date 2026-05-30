/**
 * SQLite Database connection and persistence manager.
 * Uses sql.js (WebAssembly) for offline database compatibility without native compiling.
 */

import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { CREATE_TABLES_SQL } from './schema';

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

  // Execute standard tables schema and indexes setup
  dbInstance.run(CREATE_TABLES_SQL);

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

export function mapResultToObjects<T>(result: initSqlJs.QueryExecResult[]): T[] {
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

