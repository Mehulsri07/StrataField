/**
 * SQLite database schema definition.
 */

export const CREATE_TABLES_SQL = `
  -- Enable foreign key support
  PRAGMA foreign_keys = ON;

  -- Borewells Table
  CREATE TABLE IF NOT EXISTS borewells (
    id TEXT PRIMARY KEY,
    borewell_id TEXT NOT NULL,
    project TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    house_no TEXT,
    area TEXT,
    city TEXT NOT NULL,
    address TEXT,
    latitude REAL,
    longitude REAL,
    bore_dia REAL,
    pipe_dia REAL,
    total_depth REAL,
    water_level REAL,
    remarks TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    import_source TEXT,
    import_method TEXT,
    deleted_at TEXT
  );

  -- Strata Layers Table
  CREATE TABLE IF NOT EXISTS strata_layers (
    id TEXT PRIMARY KEY,
    borewell_id TEXT NOT NULL,
    start_depth REAL NOT NULL,
    end_depth REAL NOT NULL,
    material TEXT NOT NULL,
    color TEXT NOT NULL,
    pattern TEXT NOT NULL,
    remarks TEXT,
    FOREIGN KEY(borewell_id) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Pipe Assemblies Table
  CREATE TABLE IF NOT EXISTS pipe_assemblies (
    id TEXT PRIMARY KEY,
    borewell_id TEXT NOT NULL,
    start_depth REAL NOT NULL,
    end_depth REAL NOT NULL,
    pipe_type TEXT NOT NULL,
    FOREIGN KEY(borewell_id) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Photos Table
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    borewell_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    capture_date TEXT,
    FOREIGN KEY(borewell_id) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Files Table
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    borewell_id TEXT NOT NULL,
    excel_path TEXT,
    pdf_path TEXT,
    FOREIGN KEY(borewell_id) REFERENCES borewells(id) ON DELETE CASCADE
  );

  -- Materials Dictionary Table
  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    pattern TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0
  );

  -- Geocoding Cache Table
  CREATE TABLE IF NOT EXISTS geocoding_cache (
    query TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    display_name TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );

  -- Indexes for search and relation optimization
  CREATE INDEX IF NOT EXISTS idx_borewells_owner ON borewells(owner_name);
  CREATE INDEX IF NOT EXISTS idx_borewells_city ON borewells(city);
  CREATE INDEX IF NOT EXISTS idx_borewells_project ON borewells(project);
  CREATE INDEX IF NOT EXISTS idx_strata_borewell_id ON strata_layers(borewell_id);
  CREATE INDEX IF NOT EXISTS idx_pipe_borewell_id ON pipe_assemblies(borewell_id);
  CREATE INDEX IF NOT EXISTS idx_photos_borewell_id ON photos(borewell_id);
  CREATE INDEX IF NOT EXISTS idx_files_borewell_id ON files(borewell_id);
`;
