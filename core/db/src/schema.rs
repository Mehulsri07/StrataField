//! Schema migrations. The schema version lives in `PRAGMA user_version`.
//!
//! Rules:
//! - Never edit a migration that has shipped; add a new one to the end of `MIGRATIONS`.
//! - Every app that opens the database uses this list, so they always agree on the schema.
//! - An app that finds a newer version than it knows refuses to open the file (see `db.rs`).

use crate::error::{DbError, Result};
use rusqlite::Connection;

/// Ordered migrations. Entry `i` upgrades the database from version `i` to `i + 1`.
pub const MIGRATIONS: &[&str] = &[
    // ── Version 1: StrataField data model v2 (29 Sep 2026) ──────────────────
    r#"
    CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE materials (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color            TEXT NOT NULL,
        pattern          TEXT NOT NULL,
        is_custom        INTEGER NOT NULL DEFAULT 0,
        lithology_class  TEXT,
        lithology_family TEXT CHECK (lithology_family IN ('CLAY','SAND','ROCK','OTHER','NONE') OR lithology_family IS NULL),
        sort_order       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE import_batches (
        id                 TEXT PRIMARY KEY,
        file_name          TEXT NOT NULL,
        file_sha256        TEXT,
        stored_path        TEXT,
        imported_at        TEXT NOT NULL,
        borewell_count     INTEGER NOT NULL DEFAULT 0,
        -- JSON: names the parser did not recognise, and what the user chose for each
        unrecognised_names TEXT NOT NULL DEFAULT '[]',
        resolutions        TEXT NOT NULL DEFAULT '{}',
        notes              TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE borewells (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT REFERENCES projects(id),
        borewell_id         TEXT NOT NULL,
        owner_name          TEXT NOT NULL DEFAULT '',
        house_no            TEXT NOT NULL DEFAULT '',
        area                TEXT NOT NULL DEFAULT '',
        city                TEXT NOT NULL DEFAULT '',
        address             TEXT NOT NULL DEFAULT '',
        latitude            REAL,
        longitude           REAL,
        -- How the location was obtained; address lookups are approximate.
        location_source     TEXT NOT NULL DEFAULT 'unknown'
                            CHECK (location_source IN ('gps','photo','map','typed','address','imported','unknown')),
        location_accuracy_m REAL,
        ground_elevation_m  REAL,
        elevation_source    TEXT CHECK (elevation_source IN ('survey','gps','dem','typed','unknown') OR elevation_source IS NULL),
        bore_dia            REAL,
        pipe_dia            REAL,
        total_depth         REAL,
        water_level         REAL,
        dynamic_water_level REAL,
        depth_unit          TEXT NOT NULL DEFAULT 'ft' CHECK (depth_unit IN ('ft','m')),
        drilling_method     TEXT CHECK (drilling_method IN ('ROTARY','DTH','MANUAL','UNKNOWN') OR drilling_method IS NULL),
        record_quality      TEXT NOT NULL DEFAULT 'unknown' CHECK (record_quality IN ('good','fair','poor','unknown')),
        remarks             TEXT NOT NULL DEFAULT '',
        date                TEXT NOT NULL DEFAULT '',
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL,
        import_batch_id     TEXT REFERENCES import_batches(id),
        import_source       TEXT,
        import_method       TEXT NOT NULL DEFAULT 'manual' CHECK (import_method IN ('excel','manual','legacy')),
        deleted_at          TEXT
    );

    CREATE TABLE strata_layers (
        id            TEXT PRIMARY KEY,
        borewell_id   TEXT NOT NULL REFERENCES borewells(id) ON DELETE CASCADE,
        start_depth   REAL NOT NULL,
        end_depth     REAL NOT NULL,
        material      TEXT NOT NULL,
        material_id   TEXT REFERENCES materials(id),
        color         TEXT NOT NULL,
        pattern       TEXT NOT NULL,
        remarks       TEXT NOT NULL DEFAULT '',
        water_bearing INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE pipe_assemblies (
        id           TEXT PRIMARY KEY,
        borewell_id  TEXT NOT NULL REFERENCES borewells(id) ON DELETE CASCADE,
        start_depth  REAL NOT NULL,
        end_depth    REAL NOT NULL,
        pipe_type    TEXT NOT NULL CHECK (pipe_type IN ('plain','slotted')),
        pipe_subtype TEXT CHECK (pipe_subtype IN ('PLAIN','RIBBED_SCREEN','SLOTTED','MS_SLOTTED') OR pipe_subtype IS NULL),
        diameter     REAL
    );

    CREATE TABLE water_readings (
        id            TEXT PRIMARY KEY,
        borewell_id   TEXT NOT NULL REFERENCES borewells(id) ON DELETE CASCADE,
        measured_on   TEXT NOT NULL,
        static_level  REAL,
        dynamic_level REAL,
        source        TEXT NOT NULL DEFAULT '',
        remarks       TEXT NOT NULL DEFAULT ''
    );

    -- Paths are relative to the data folder for files StrataField manages,
    -- absolute for files that stayed where the old app left them.
    CREATE TABLE photos (
        id           TEXT PRIMARY KEY,
        borewell_id  TEXT NOT NULL REFERENCES borewells(id) ON DELETE CASCADE,
        file_path    TEXT NOT NULL,
        capture_date TEXT,
        latitude     REAL,
        longitude    REAL,
        caption      TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL
    );

    CREATE TABLE files (
        id            TEXT PRIMARY KEY,
        borewell_id   TEXT NOT NULL REFERENCES borewells(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL CHECK (kind IN ('excel','pdf','other')),
        file_path     TEXT NOT NULL,
        original_name TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL
    );

    CREATE TABLE record_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        entity      TEXT NOT NULL,
        entity_id   TEXT NOT NULL,
        action      TEXT NOT NULL CHECK (action IN ('create','update','delete','restore','import','purge')),
        changed_at  TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        before_json TEXT,
        after_json  TEXT
    );

    CREATE TABLE sections (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        line_json         TEXT NOT NULL,
        corridor_half_km  REAL NOT NULL,
        settings_json     TEXT NOT NULL DEFAULT '{}',
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
    );

    CREATE TABLE geocoding_cache (
        query        TEXT PRIMARY KEY,
        latitude     REAL NOT NULL,
        longitude    REAL NOT NULL,
        display_name TEXT NOT NULL,
        cached_at    TEXT NOT NULL
    );

    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE INDEX idx_borewells_project   ON borewells(project_id);
    CREATE INDEX idx_borewells_code      ON borewells(borewell_id);
    CREATE INDEX idx_borewells_owner     ON borewells(owner_name);
    CREATE INDEX idx_borewells_area      ON borewells(area);
    CREATE INDEX idx_borewells_city      ON borewells(city);
    CREATE INDEX idx_borewells_deleted   ON borewells(deleted_at);
    CREATE INDEX idx_strata_borewell     ON strata_layers(borewell_id);
    CREATE INDEX idx_strata_material     ON strata_layers(material_id);
    CREATE INDEX idx_pipes_borewell      ON pipe_assemblies(borewell_id);
    CREATE INDEX idx_water_borewell      ON water_readings(borewell_id, measured_on);
    CREATE INDEX idx_photos_borewell     ON photos(borewell_id);
    CREATE INDEX idx_files_borewell      ON files(borewell_id);
    CREATE INDEX idx_history_entity      ON record_history(entity, entity_id);
    "#,
];

/// The schema version this build understands.
pub const LATEST_VERSION: i64 = MIGRATIONS.len() as i64;

pub fn current_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Brings the database up to `LATEST_VERSION`, one migration per transaction.
/// Returns the version the database had before migrating.
pub fn migrate(conn: &mut Connection) -> Result<i64> {
    let start = current_version(conn)?;
    if start > LATEST_VERSION {
        return Err(DbError::NewerSchema {
            found: start,
            supported: LATEST_VERSION,
        });
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(start as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        // PRAGMA cannot take bound parameters; the value is our own integer.
        tx.execute_batch(&format!("PRAGMA user_version = {}", index + 1))?;
        tx.commit()?;
    }
    Ok(start)
}
