#![allow(dead_code)]

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use strata_db::models::BorewellInput;
use strata_db::Database;
use tempfile::TempDir;

pub fn open_temp() -> (TempDir, Database) {
    let dir = tempfile::tempdir().unwrap();
    let (db, _) = Database::open(dir.path()).unwrap();
    (dir, db)
}

pub fn input(code: &str) -> BorewellInput {
    BorewellInput {
        project: "Zone 1 · Old City".into(),
        borewell_id: code.into(),
        owner_name: "Test Owner".into(),
        area: "Aminabad".into(),
        city: "Lucknow".into(),
        latitude: Some(26.846),
        longitude: Some(80.927),
        total_depth: Some(300.0),
        water_level: Some(110.0),
        date: "2026-08-08".into(),
        ..Default::default()
    }
}

/// Which old Electron schema generation to build.
#[derive(Clone, Copy)]
pub enum LegacyGeneration {
    /// Earliest: camelCase columns.
    CamelCase,
    /// snake_case without material links or pipe subtypes (what the owner's real database has).
    SnakeEarly,
    /// snake_case with drilling_method, depth_unit, material_id, pipe_subtype, lithology columns.
    SnakeLatest,
}

/// Builds a small old-format database: two borewells (one in the recycle bin), layers, pipes,
/// a photo, a files row, a custom material and a material name no current type matches.
pub fn build_legacy(dir: &Path, generation: LegacyGeneration) -> PathBuf {
    let path = dir.join("stratafield.db");
    let c = Connection::open(&path).unwrap();
    match generation {
        LegacyGeneration::CamelCase => c
            .execute_batch(
                r#"
            CREATE TABLE borewells (id TEXT PRIMARY KEY, borewellId TEXT, ownerName TEXT, houseNo TEXT, area TEXT, city TEXT,
                address TEXT, latitude REAL, longitude REAL, boreDia REAL, pipeDia REAL, totalDepth REAL, waterLevel REAL,
                remarks TEXT, date TEXT, createdAt TEXT, updatedAt TEXT);
            CREATE TABLE strata_layers (id TEXT, borewellId TEXT, startDepth REAL, endDepth REAL, material TEXT, color TEXT, pattern TEXT, remarks TEXT);
            CREATE TABLE pipe_assemblies (id TEXT, borewellId TEXT, startDepth REAL, endDepth REAL, pipeType TEXT);
            INSERT INTO borewells VALUES ('b1','BW-001','Asha',NULL,'Chowk','Lucknow',NULL,26.868,80.911,10,6,320,116,'','2025-02-01','2025-02-01T00:00:00Z','2025-02-01T00:00:00Z');
            INSERT INTO borewells VALUES ('b2','BW-002','Ravi',NULL,'Alambagh','Lucknow',NULL,NULL,NULL,8,5,300,'102','','2025-03-01','2025-03-01T00:00:00Z','2025-03-01T00:00:00Z');
            INSERT INTO strata_layers VALUES ('s1','b1',0,20,'Clay','#8B6914','lines',''), ('s2','b1',20,60,'Murrum','#999999','dots','');
            INSERT INTO pipe_assemblies VALUES ('p1','b1',0,100,'plain'), ('p2','b1',100,140,'Slotted');
            "#,
            )
            .unwrap(),
        LegacyGeneration::SnakeEarly | LegacyGeneration::SnakeLatest => {
            let latest = matches!(generation, LegacyGeneration::SnakeLatest);
            c.execute_batch(&format!(
                r#"
            CREATE TABLE borewells (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, project TEXT NOT NULL, owner_name TEXT NOT NULL,
                house_no TEXT, area TEXT, city TEXT NOT NULL, address TEXT, latitude REAL, longitude REAL, bore_dia REAL, pipe_dia REAL,
                total_depth REAL, water_level REAL, remarks TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                import_source TEXT, import_method TEXT, deleted_at TEXT {b});
            CREATE TABLE strata_layers (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, start_depth REAL NOT NULL, end_depth REAL NOT NULL,
                material TEXT NOT NULL, color TEXT NOT NULL, pattern TEXT NOT NULL, remarks TEXT {s});
            CREATE TABLE pipe_assemblies (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, start_depth REAL NOT NULL, end_depth REAL NOT NULL,
                pipe_type TEXT NOT NULL {p});
            CREATE TABLE photos (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, file_path TEXT NOT NULL, capture_date TEXT);
            CREATE TABLE files (id TEXT PRIMARY KEY, borewell_id TEXT NOT NULL, excel_path TEXT, pdf_path TEXT);
            CREATE TABLE materials (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, pattern TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0 {m});
            CREATE TABLE geocoding_cache (query TEXT PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL, display_name TEXT NOT NULL, cached_at TEXT NOT NULL);
            "#,
                b = if latest { ", drilling_method TEXT, depth_unit TEXT NOT NULL DEFAULT 'ft'" } else { "" },
                s = if latest { ", material_id TEXT" } else { "" },
                p = if latest { ", pipe_subtype TEXT" } else { "" },
                m = if latest { ", lithology_class TEXT, lithology_family TEXT" } else { "" },
            ))
            .unwrap();
            c.execute_batch(
                r#"
            INSERT INTO borewells (id, borewell_id, project, owner_name, area, city, latitude, longitude, bore_dia, pipe_dia, total_depth,
                water_level, remarks, date, created_at, updated_at, import_method, deleted_at)
              VALUES ('b1','BW-001','Default Project','Asha','Chowk','Lucknow',26.868,80.911,10,6,320,116,'','2025-02-01','2025-02-01T00:00:00Z','2025-02-01T00:00:00Z','manual',NULL),
                     ('b2','BW-002','Zone 5','Ravi','Alambagh','Lucknow',NULL,NULL,8,5,300,102,'','2025-03-01','2025-03-01T00:00:00Z','2025-03-01T00:00:00Z','excel','2025-04-01T00:00:00Z');
            INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, color, pattern, remarks)
              VALUES ('s1','b1',0,20,'Clay','#8B6914','lines',''), ('s2','b1',20,60,'Murrum','#999999','dots',''), ('s3','b1',60,90,'Pebble Bed','#777777','circles','');
            INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type) VALUES ('p1','b1',0,100,'plain'), ('p2','b1',100,140,'slotted'), ('p9','gone',0,10,'plain');
            INSERT INTO photos VALUES ('ph1','b1','C:\Old\photo1.jpg','2025-02-01');
            INSERT INTO files VALUES ('f1','b1','C:\Old\log.xlsx','C:\Old\report.pdf');
            INSERT INTO materials (id, name, color, pattern, is_custom) VALUES ('m_clay','Clay','#8B6914','lines',0), ('m_peb','Pebble Bed','#777777','circles',1), ('m_med','medium sand','#D4B862','dots',0);
            INSERT INTO geocoding_cache VALUES ('chowk lucknow',26.868,80.911,'Chowk, Lucknow','2025-02-01T00:00:00Z');
            "#,
            )
            .unwrap();
            if latest {
                c.execute_batch("UPDATE borewells SET drilling_method = 'DTH' WHERE id = 'b1'; UPDATE strata_layers SET material_id = 'm_clay' WHERE id = 's1'; UPDATE pipe_assemblies SET pipe_subtype = 'RIBBED_SCREEN' WHERE id = 'p2';").unwrap();
            }
        }
    }
    path
}

pub fn file_digest(path: &Path) -> (u64, Vec<u8>) {
    let bytes = std::fs::read(path).unwrap();
    (bytes.len() as u64, bytes)
}
