use crate::backup::{self, BackupReason};
use crate::error::{DbError, Result};
use crate::models::Material;
use crate::schema;
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

/// File name of the shared database inside the data folder.
pub const DB_FILE_NAME: &str = "strata.db";

const DEFAULT_MATERIALS_JSON: &str = include_str!("../../materials.json");

/// The shared StrataField database and the folder that holds it, its backups and attachments.
///
/// Every app (StrataField now, StrataVision later) opens the same file. WAL mode lets them
/// read and write at the same time; `data_version` tells each app when the other has written.
pub struct Database {
    data_dir: PathBuf,
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenReport {
    pub path: String,
    pub schema_version: i64,
    pub previous_version: i64,
    pub created: bool,
    /// Backup taken before an upgrade, if one was needed.
    pub upgrade_backup: Option<String>,
}

impl Database {
    /// Opens (creating if needed) `<data_dir>/strata.db`, applies migrations and seeds default materials.
    pub fn open(data_dir: impl Into<PathBuf>) -> Result<(Self, OpenReport)> {
        let data_dir = data_dir.into();
        std::fs::create_dir_all(&data_dir)?;
        let path = data_dir.join(DB_FILE_NAME);
        let created = !path.exists();

        let mut conn = Connection::open(&path)?;
        configure(&conn)?;

        let previous_version = schema::current_version(&conn)?;
        if previous_version > schema::LATEST_VERSION {
            return Err(DbError::NewerSchema {
                found: previous_version,
                supported: schema::LATEST_VERSION,
            });
        }
        // Keep a copy of the old file before changing its structure.
        let upgrade_backup = if previous_version > 0 && previous_version < schema::LATEST_VERSION {
            let info = backup::create(&conn, &backups_dir(&data_dir), BackupReason::BeforeUpdate)?;
            Some(info.file_name)
        } else {
            None
        };
        schema::migrate(&mut conn)?;
        seed_default_materials(&conn)?;

        let report = OpenReport {
            path: path.to_string_lossy().into_owned(),
            schema_version: schema::current_version(&conn)?,
            previous_version,
            created,
            upgrade_backup,
        };
        Ok((
            Self {
                data_dir,
                conn: Mutex::new(conn),
            },
            report,
        ))
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn path(&self) -> PathBuf {
        self.data_dir.join(DB_FILE_NAME)
    }

    pub fn backups_dir(&self) -> PathBuf {
        backups_dir(&self.data_dir)
    }

    /// Runs `f` with the connection. Use for reads and single statements.
    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        f(&self.lock())
    }

    /// Runs `f` inside one transaction: either everything it writes is saved, or nothing is.
    pub fn with_tx<T>(&self, f: impl FnOnce(&rusqlite::Transaction) -> Result<T>) -> Result<T> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    }

    /// Runs `f` with exclusive, mutable access (restores and other whole-database operations).
    pub(crate) fn with_mut<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        f(&mut self.lock())
    }

    /// Changes whenever *another* connection (for example another Strata app) commits a write.
    /// Screens poll this to know when to refresh.
    pub fn data_version(&self) -> Result<i64> {
        Ok(self
            .lock()
            .query_row("PRAGMA data_version", [], |r| r.get(0))?)
    }

    fn lock(&self) -> MutexGuard<'_, Connection> {
        // A panic while holding the lock leaves the connection itself usable; SQLite rolls back.
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

pub(crate) fn backups_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("backups")
}

pub(crate) fn configure(conn: &Connection) -> Result<()> {
    conn.busy_timeout(Duration::from_secs(5))?;
    // journal_mode returns a row, so it is read rather than executed.
    let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")?;
    Ok(())
}

/// Default materials from `core/materials.json`. Existing rows are left alone, so a user's
/// edits survive; materials added in newer versions appear automatically.
pub(crate) fn default_materials() -> Vec<Material> {
    serde_json::from_str::<Vec<Material>>(DEFAULT_MATERIALS_JSON)
        .expect("core/materials.json is valid")
}

pub(crate) fn seed_default_materials(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT OR IGNORE INTO materials (id, name, color, pattern, is_custom, lithology_class, lithology_family, sort_order)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
    )?;
    for (order, m) in default_materials().iter().enumerate() {
        stmt.execute(params![
            m.id,
            m.name,
            m.color,
            m.pattern,
            m.lithology_class,
            m.lithology_family,
            order as i64
        ])?;
    }
    Ok(())
}

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Writes one line of the change history, inside the caller's transaction.
pub(crate) fn record_history(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    action: &str,
    summary: &str,
    before: Option<&serde_json::Value>,
    after: Option<&serde_json::Value>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO record_history (entity, entity_id, action, changed_at, summary, before_json, after_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            entity,
            entity_id,
            action,
            now(),
            summary,
            before.map(|v| v.to_string()),
            after.map(|v| v.to_string())
        ],
    )?;
    Ok(())
}

/// Reads a JSON setting, or `None` if it has never been saved.
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<serde_json::Value>> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(match raw {
        Some(s) => Some(serde_json::from_str(&s)?),
        None => None,
    })
}

pub fn set_setting(conn: &Connection, key: &str, value: &serde_json::Value) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )?;
    Ok(())
}

/// Stored paths are relative to the data folder unless they were already absolute.
pub(crate) fn resolve_path(data_dir: &Path, stored: &str) -> String {
    let p = Path::new(stored);
    if p.is_absolute() {
        // Files the older app pointed to, left where they were.
        stored.to_string()
    } else {
        // A relative path must stay inside the attachments folder; anything else (for example
        // "../" in a damaged or tampered backup) is treated as a missing file.
        managed_path(data_dir, stored)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

/// The real location of a file StrataField stored, if `stored` is a plain path inside the
/// data folder's `attachments` folder (no "..", no drive or root). `None` for anything else.
pub fn managed_path(data_dir: &Path, stored: &str) -> Option<std::path::PathBuf> {
    use std::path::Component;
    let p = Path::new(stored);
    let mut parts = p.components();
    let first_is_attachments =
        matches!(parts.next(), Some(Component::Normal(c)) if c == "attachments");
    let rest_is_plain = parts.all(|c| matches!(c, Component::Normal(_)));
    (first_is_attachments && rest_is_plain && p.components().count() >= 2).then(|| data_dir.join(p))
}
