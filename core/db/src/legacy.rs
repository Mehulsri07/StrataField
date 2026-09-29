//! One-time import from the older Electron StrataField database (`stratafield.db`).
//!
//! The old file is opened read-only and never changed. Three schema generations existed
//! (camelCase columns; snake_case; snake_case with material links and pipe subtypes), so every
//! column is looked up by name and missing ones fall back to sensible defaults.

use crate::backup::{self, BackupReason};
use crate::db::{self, new_id, now, record_history, Database};
use crate::error::{DbError, Result};
use crate::repo::{materials, projects};
use rusqlite::types::Value;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

pub const SETTING_KEY: &str = "legacy_import";

type Row = HashMap<String, Value>;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportReport {
    pub source: String,
    pub borewells: usize,
    pub in_recycle_bin: usize,
    pub strata_layers: usize,
    pub pipe_segments: usize,
    pub photos: usize,
    pub files: usize,
    pub water_readings: usize,
    pub custom_materials_added: usize,
    /// Borewells skipped because a record with the same id already exists.
    pub already_present: usize,
    /// Soil names in the old data that match no known soil type; the layers keep their text.
    pub unmatched_material_names: Vec<String>,
    /// Old rows pointing at a borewell that no longer exists in the old file (left behind when
    /// the old app deleted a borewell). They cannot be attached to anything, so they are counted here.
    pub orphaned_layers: usize,
    pub orphaned_pipes: usize,
    pub orphaned_attachments: usize,
    pub safety_backup: Option<String>,
}

/// Finds the old app's database: `%APPDATA%\StrataField\stratafield.db`, or the path in its settings.json.
pub fn find_legacy_database(appdata_roaming: &Path) -> Option<std::path::PathBuf> {
    let dir = appdata_roaming.join("StrataField");
    let from_settings = std::fs::read_to_string(dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| {
            v.get("databasePath")
                .and_then(|p| p.as_str())
                .map(std::path::PathBuf::from)
        });
    [from_settings, Some(dir.join("stratafield.db"))]
        .into_iter()
        .flatten()
        .find(|p| p.is_file())
}

pub fn already_imported(conn: &Connection) -> Result<bool> {
    Ok(db::get_setting(conn, SETTING_KEY)?.is_some())
}

/// Copies everything from the old database into `db`, in one transaction.
pub fn import(db: &Database, legacy_path: &Path) -> Result<LegacyImportReport> {
    let old = open_legacy(legacy_path)?;
    let data = LegacyData::read(&old)?;
    drop(old);

    let safety_backup = if db.with(crate::repo::borewells::count_active)? > 0 {
        Some(
            db.with(|c| backup::create(c, &db.backups_dir(), BackupReason::BeforeLegacyImport))?
                .file_name,
        )
    } else {
        None
    };

    let mut report = db.with_tx(|tx| write(tx, &data))?;
    report.source = legacy_path.to_string_lossy().into_owned();
    report.safety_backup = safety_backup;
    db.with(|c| {
        db::set_setting(
            c,
            SETTING_KEY,
            &serde_json::json!({ "importedAt": now(), "report": report }),
        )
    })?;
    Ok(report)
}

fn open_legacy(path: &Path) -> Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| {
        DbError::Invalid(format!(
            "The older StrataField data could not be opened: {e}"
        ))
    })?;
    let check: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if check != "ok" {
        return Err(DbError::CorruptBackup(check));
    }
    let has_borewells: Option<String> = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'borewells'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if has_borewells.is_none() {
        return Err(DbError::Invalid(
            "This file does not contain StrataField borewell data.".into(),
        ));
    }
    Ok(conn)
}

struct LegacyData {
    borewells: Vec<Row>,
    strata: Vec<Row>,
    pipes: Vec<Row>,
    photos: Vec<Row>,
    files: Vec<Row>,
    materials: Vec<Row>,
    geocoding: Vec<Row>,
}

impl LegacyData {
    fn read(c: &Connection) -> Result<Self> {
        Ok(Self {
            borewells: read_table(c, "borewells")?,
            strata: read_table(c, "strata_layers")?,
            pipes: read_table(c, "pipe_assemblies")?,
            photos: read_table(c, "photos")?,
            files: read_table(c, "files")?,
            materials: read_table(c, "materials")?,
            geocoding: read_table(c, "geocoding_cache")?,
        })
    }
}

fn write(tx: &Connection, d: &LegacyData) -> Result<LegacyImportReport> {
    let mut report = LegacyImportReport::default();

    // Materials: map every old material id to a current one, adding the user's own types.
    let mut material_map: HashMap<String, String> = HashMap::new();
    for m in &d.materials {
        let (Some(old_id), Some(name)) = (text(m, &["id"]), text(m, &["name"])) else {
            continue;
        };
        let new_id = match find_known(&materials::list(tx)?, &name) {
            Some(existing) => existing,
            None => {
                let created = materials::create(
                    tx,
                    &crate::models::Material {
                        id: String::new(),
                        name: name.clone(),
                        color: text(m, &["color"])
                            .filter(|c| c.len() == 7)
                            .unwrap_or_else(|| "#9AA4AD".into()),
                        pattern: text(m, &["pattern"]).unwrap_or_else(|| "solid".into()),
                        is_custom: true,
                        lithology_class: text(m, &["lithology_class", "lithologyClass"]),
                        lithology_family: text(m, &["lithology_family", "lithologyFamily"]).filter(
                            |f| ["CLAY", "SAND", "ROCK", "OTHER", "NONE"].contains(&f.as_str()),
                        ),
                    },
                )?;
                report.custom_materials_added += 1;
                created.id
            }
        };
        material_map.insert(old_id, new_id);
    }
    let known = materials::list(tx)?;

    let mut imported_ids: Vec<String> = Vec::new();
    for b in &d.borewells {
        let Some(id) = text(b, &["id"]) else { continue };
        let exists: Option<String> = tx
            .query_row("SELECT id FROM borewells WHERE id = ?1", [&id], |r| {
                r.get(0)
            })
            .optional()?;
        if exists.is_some() {
            report.already_present += 1;
            continue;
        }
        let project_id = projects::id_for_name(tx, &text(b, &["project"]).unwrap_or_default())?;
        let (lat, lon) = (real(b, &["latitude"]), real(b, &["longitude"]));
        let (lat, lon) = match (lat, lon) {
            (Some(la), Some(lo))
                if (-90.0..=90.0).contains(&la) && (-180.0..=180.0).contains(&lo) =>
            {
                (Some(la), Some(lo))
            }
            _ => (None, None),
        };
        let deleted_at = text(b, &["deleted_at", "deletedAt"]);
        let ts = now();
        tx.execute(
            "INSERT INTO borewells (id, project_id, borewell_id, owner_name, house_no, area, city, address, latitude, longitude,
                location_source, bore_dia, pipe_dia, total_depth, water_level, depth_unit, drilling_method, remarks, date,
                created_at, updated_at, import_source, import_method, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'unknown', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
            params![
                id,
                project_id,
                text(b, &["borewell_id", "borewellId"]).unwrap_or_else(|| id.clone()),
                text(b, &["owner_name", "ownerName"]).unwrap_or_default(),
                text(b, &["house_no", "houseNo"]).unwrap_or_default(),
                text(b, &["area"]).unwrap_or_default(),
                text(b, &["city"]).unwrap_or_default(),
                text(b, &["address"]).unwrap_or_default(),
                lat,
                lon,
                real(b, &["bore_dia", "boreDia"]),
                real(b, &["pipe_dia", "pipeDia"]),
                real(b, &["total_depth", "totalDepth"]),
                real(b, &["water_level", "waterLevel"]),
                text(b, &["depth_unit", "depthUnit"]).filter(|u| u == "m").unwrap_or_else(|| "ft".into()),
                text(b, &["drilling_method", "drillingMethod"])
                    .filter(|m| ["ROTARY", "DTH", "MANUAL", "UNKNOWN"].contains(&m.as_str())),
                text(b, &["remarks"]).unwrap_or_default(),
                text(b, &["date"]).unwrap_or_default(),
                text(b, &["created_at", "createdAt"]).unwrap_or_else(|| ts.clone()),
                text(b, &["updated_at", "updatedAt"]).unwrap_or_else(|| ts.clone()),
                text(b, &["import_source", "importSource"]),
                text(b, &["import_method", "importMethod"]).filter(|m| m == "excel" || m == "manual").unwrap_or_else(|| "legacy".into()),
                deleted_at,
            ],
        )?;
        if deleted_at.is_some() {
            report.in_recycle_bin += 1;
        }
        if let (Some(level), Some(date)) = (
            real(b, &["water_level", "waterLevel"]),
            text(b, &["date"]).filter(|d| !d.is_empty()),
        ) {
            tx.execute(
                "INSERT INTO water_readings (id, borewell_id, measured_on, static_level, source) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_id(), id, date, level, "Brought over from the older StrataField"],
            )?;
            report.water_readings += 1;
        }
        record_history(
            tx,
            "borewell",
            &id,
            "import",
            "Brought over from the older StrataField",
            None,
            None,
        )?;
        imported_ids.push(id);
        report.borewells += 1;
    }
    let imported =
        |row: &Row| text(row, &["borewell_id", "borewellId"]).filter(|b| imported_ids.contains(b));
    let old_ids: Vec<String> = d
        .borewells
        .iter()
        .filter_map(|b| text(b, &["id"]))
        .collect();
    let orphans = |rows: &[Row]| {
        rows.iter()
            .filter(|r| {
                text(r, &["borewell_id", "borewellId"]).is_none_or(|b| !old_ids.contains(&b))
            })
            .count()
    };
    report.orphaned_layers = orphans(&d.strata);
    report.orphaned_pipes = orphans(&d.pipes);
    report.orphaned_attachments = orphans(&d.photos) + orphans(&d.files);

    let mut unmatched: Vec<String> = Vec::new();
    for s in &d.strata {
        let Some(borewell_id) = imported(s) else {
            continue;
        };
        let name = text(s, &["material"]).unwrap_or_default();
        let material_id = text(s, &["material_id", "materialId"])
            .and_then(|old| material_map.get(&old).cloned().or(Some(old)))
            .filter(|mid| known.iter().any(|m| &m.id == mid))
            .or_else(|| find_known(&known, &name));
        if material_id.is_none()
            && !name.trim().is_empty()
            && !unmatched
                .iter()
                .any(|u| u.eq_ignore_ascii_case(name.trim()))
        {
            unmatched.push(name.trim().to_string());
        }
        tx.execute(
            "INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, material_id, color, pattern, remarks)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                text(s, &["id"]).unwrap_or_else(new_id),
                borewell_id,
                real(s, &["start_depth", "startDepth"]).unwrap_or(0.0),
                real(s, &["end_depth", "endDepth"]).unwrap_or(0.0),
                name,
                material_id,
                text(s, &["color"]).unwrap_or_else(|| "#9AA4AD".into()),
                text(s, &["pattern"]).unwrap_or_else(|| "solid".into()),
                text(s, &["remarks"]).unwrap_or_default(),
            ],
        )?;
        report.strata_layers += 1;
    }
    report.unmatched_material_names = unmatched;

    for p in &d.pipes {
        let Some(borewell_id) = imported(p) else {
            continue;
        };
        let raw_type = text(p, &["pipe_type", "pipeType"])
            .unwrap_or_default()
            .to_lowercase();
        let pipe_type = if raw_type.contains("slot") || raw_type.contains("screen") {
            "slotted"
        } else {
            "plain"
        };
        let subtype = text(p, &["pipe_subtype", "pipeSubtype"])
            .filter(|s| ["PLAIN", "RIBBED_SCREEN", "SLOTTED", "MS_SLOTTED"].contains(&s.as_str()))
            .or_else(|| (pipe_type == "plain").then(|| "PLAIN".to_string()));
        tx.execute(
            "INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type, pipe_subtype) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                text(p, &["id"]).unwrap_or_else(new_id),
                borewell_id,
                real(p, &["start_depth", "startDepth"]).unwrap_or(0.0),
                real(p, &["end_depth", "endDepth"]).unwrap_or(0.0),
                pipe_type,
                subtype,
            ],
        )?;
        report.pipe_segments += 1;
    }

    for ph in &d.photos {
        let Some(borewell_id) = imported(ph) else {
            continue;
        };
        let Some(path) = text(ph, &["file_path", "filePath"]) else {
            continue;
        };
        tx.execute(
            "INSERT INTO photos (id, borewell_id, file_path, capture_date, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![text(ph, &["id"]).unwrap_or_else(new_id), borewell_id, path, text(ph, &["capture_date", "captureDate"]), now()],
        )?;
        report.photos += 1;
    }

    for f in &d.files {
        let Some(borewell_id) = imported(f) else {
            continue;
        };
        for (kind, cols) in [
            ("excel", ["excel_path", "excelPath"]),
            ("pdf", ["pdf_path", "pdfPath"]),
        ] {
            let Some(path) = text(f, &cols).filter(|p| !p.is_empty()) else {
                continue;
            };
            let name = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            tx.execute(
                "INSERT INTO files (id, borewell_id, kind, file_path, original_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![new_id(), borewell_id, kind, path, name, now()],
            )?;
            report.files += 1;
        }
    }

    for g in &d.geocoding {
        if let (Some(q), Some(la), Some(lo), Some(name)) = (
            text(g, &["query"]),
            real(g, &["latitude"]),
            real(g, &["longitude"]),
            text(g, &["display_name", "displayName"]),
        ) {
            tx.execute(
                "INSERT OR IGNORE INTO geocoding_cache (query, latitude, longitude, display_name, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![q, la, lo, name, text(g, &["cached_at", "cachedAt"]).unwrap_or_else(now)],
            )?;
        }
    }
    Ok(report)
}

/// Matches an old material name to a current material by name, or by id
/// (the old app's "medium sand" is today's "Sand", id `medium_sand`).
fn find_known(known: &[crate::models::Material], name: &str) -> Option<String> {
    let name = name.trim();
    let as_id = name
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("_");
    known
        .iter()
        .find(|m| m.name.eq_ignore_ascii_case(name))
        .or_else(|| known.iter().find(|m| m.id == as_id))
        .map(|m| m.id.clone())
}

fn read_table(c: &Connection, table: &str) -> Result<Vec<Row>> {
    let exists: Option<String> = c
        .query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |r| r.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Ok(Vec::new());
    }
    let mut stmt = c.prepare(&format!("SELECT * FROM \"{table}\""))?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let rows = stmt.query_map([], |r| {
        let mut row = Row::new();
        for (i, n) in names.iter().enumerate() {
            row.insert(n.clone(), r.get::<_, Value>(i)?);
        }
        Ok(row)
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// First non-empty value among `names`, as text.
fn text(row: &Row, names: &[&str]) -> Option<String> {
    names.iter().find_map(|n| match row.get(*n)? {
        Value::Text(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Integer(i) => Some(i.to_string()),
        Value::Real(f) => Some(f.to_string()),
        _ => None,
    })
}

/// First numeric value among `names`; numbers stored as text are parsed.
fn real(row: &Row, names: &[&str]) -> Option<f64> {
    names.iter().find_map(|n| match row.get(*n)? {
        Value::Real(f) if f.is_finite() => Some(*f),
        Value::Integer(i) => Some(*i as f64),
        Value::Text(s) => s.trim().parse::<f64>().ok().filter(|f| f.is_finite()),
        _ => None,
    })
}
