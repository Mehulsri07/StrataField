/**
 * SQLite database schema definition.
 */

export const CREATE_TABLES_SQL = `
  -- Enable foreign key support
  PRAGMA foreign_keys = ON;

  -- Borewells Table
  CREATE TABLE IF NOT EXISTS borewells (
    id TEXT PRIMARY KEY,
    borewellId TEXT NOT NULL,
    ownerName TEXT NOT NULL,
    houseNo TEXT,
    area TEXT,
    city TEXT NOT NULL,
    address TEXT,
    latitude REAL,
    longitude REAL,
    boreDia REAL,
    pipeDia REAL,
    totalDepth REAL,
    waterLevel REAL,
    remarks TEXT,
    date TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- Strata Layers Table
  CREATE TABLE IF NOT EXISTS strata_layers (
    id TEXT PRIMARY KEY,
    borewellId TEXT NOT NULL,
    startDepth REAL NOT NULL,
    endDepth REAL NOT NULL,
    material TEXT NOT NULL,
    color TEXT NOT NULL,
    pattern TEXT NOT NULL,
    remarks TEXT,
    FOREIGN KEY(borewellId) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Pipe Assemblies Table
  CREATE TABLE IF NOT EXISTS pipe_assemblies (
    id TEXT PRIMARY KEY,
    borewellId TEXT NOT NULL,
    startDepth REAL NOT NULL,
    endDepth REAL NOT NULL,
    pipeType TEXT NOT NULL,
    FOREIGN KEY(borewellId) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Photos Table
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    borewellId TEXT NOT NULL,
    filePath TEXT NOT NULL,
    captureDate TEXT,
    FOREIGN KEY(borewellId) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Files Table
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    borewellId TEXT NOT NULL,
    excelPath TEXT,
    pdfPath TEXT,
    FOREIGN KEY(borewellId) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Indexes for search optimization
  CREATE INDEX IF NOT EXISTS idx_borewells_owner ON borewells(ownerName);
  CREATE INDEX IF NOT EXISTS idx_borewells_city ON borewells(city);
  CREATE INDEX IF NOT EXISTS idx_strata_borewellId ON strata_layers(borewellId);
  CREATE INDEX IF NOT EXISTS idx_pipe_borewellId ON pipe_assemblies(borewellId);
`;
