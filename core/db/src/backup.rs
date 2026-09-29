//! Database backups: consistent snapshots taken with SQLite's online backup API,
//! verified after writing, pruned by kind, and restorable into the open database.

use crate::db::{self, Database};
use crate::error::{DbError, Result};
use crate::schema;
use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

/// How many automatic backups to keep. Manual and safety backups are never pruned.
pub const KEEP_AUTOMATIC: usize = 10;

const PREFIX: &str = "strata-";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackupReason {
    Automatic,
    Manual,
    BeforeUpdate,
    BeforeRestore,
    BeforeLegacyImport,
}

impl BackupReason {
    fn tag(self) -> &'static str {
        match self {
            Self::Automatic => "auto",
            Self::Manual => "manual",
            Self::BeforeUpdate => "before-update",
            Self::BeforeRestore => "before-restore",
            Self::BeforeLegacyImport => "before-legacy-import",
        }
    }

    fn from_tag(tag: &str) -> Option<Self> {
        [
            Self::Automatic,
            Self::Manual,
            Self::BeforeUpdate,
            Self::BeforeRestore,
            Self::BeforeLegacyImport,
        ]
        .into_iter()
        .find(|r| r.tag() == tag)
    }

    /// Plain-language label for the Settings screen.
    pub fn label(self) -> &'static str {
        match self {
            Self::Automatic => "Automatic",
            Self::Manual => "Made by you",
            Self::BeforeUpdate => "Before an update",
            Self::BeforeRestore => "Before a restore",
            Self::BeforeLegacyImport => "Before importing old data",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub path: String,
    pub created_at: String,
    pub kind: String,
    pub label: String,
    pub size_bytes: u64,
    pub borewell_count: Option<i64>,
    pub readable: bool,
}

/// Writes a verified snapshot of `conn` into `dir`.
pub fn create(conn: &Connection, dir: &Path, reason: BackupReason) -> Result<BackupInfo> {
    std::fs::create_dir_all(dir)?;
    let stamp = Local::now().format("%Y%m%d-%H%M%S-%3f");
    let file_name = format!("{PREFIX}{stamp}-{}.db", reason.tag());
    let dest = dir.join(&file_name);

    conn.backup(rusqlite::MAIN_DB, &dest, None)?;
    if let Err(e) = verify(&dest) {
        let _ = std::fs::remove_file(&dest);
        return Err(e);
    }
    if reason == BackupReason::Automatic {
        prune_automatic(dir)?;
    }
    describe(&dest)
        .ok_or_else(|| DbError::Invalid("The backup was written but could not be listed.".into()))
}

/// Backups in `dir`, newest first.
pub fn list(dir: &Path) -> Result<Vec<BackupInfo>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<BackupInfo> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| describe(&e.path()))
        .collect();
    out.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    Ok(out)
}

/// Replaces the open database's contents with `source`, after saving a safety backup.
/// Older backups are upgraded to the current schema; newer or damaged ones are refused.
pub fn restore(db: &Database, source: &Path) -> Result<BackupInfo> {
    let version = verify(source)?;
    if version > schema::LATEST_VERSION {
        return Err(DbError::NewerSchema {
            found: version,
            supported: schema::LATEST_VERSION,
        });
    }
    if version == 0 {
        return Err(DbError::Invalid(
            "This file is from the older StrataField app. Use \u{201c}Import from the older version\u{201d} instead of Restore."
                .into(),
        ));
    }

    let safety = db.with(|c| create(c, &db.backups_dir(), BackupReason::BeforeRestore))?;
    db.with_mut(|conn| {
        conn.restore(
            rusqlite::MAIN_DB,
            source,
            None::<fn(rusqlite::backup::Progress)>,
        )?;
        db::configure(conn)?;
        schema::migrate(conn)?;
        db::seed_default_materials(conn)?;
        Ok(())
    })?;
    Ok(safety)
}

/// Opens `path` read-only and checks it is an intact SQLite database. Returns its schema version.
pub fn verify(path: &Path) -> Result<i64> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| DbError::CorruptBackup(e.to_string()))?;
    let check: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| DbError::CorruptBackup(e.to_string()))?;
    if check != "ok" {
        return Err(DbError::CorruptBackup(check));
    }
    schema::current_version(&conn)
}

fn describe(path: &Path) -> Option<BackupInfo> {
    let file_name = path.file_name()?.to_str()?.to_string();
    let stem = file_name.strip_prefix(PREFIX)?.strip_suffix(".db")?;
    // stem: YYYYMMDD-HHMMSS-mmm-<tag>
    let (stamp, tag) = (stem.get(..19)?, stem.get(20..)?);
    let reason = BackupReason::from_tag(tag)?;
    let created_at = format!(
        "{}-{}-{} {}:{}:{}",
        &stamp[0..4],
        &stamp[4..6],
        &stamp[6..8],
        &stamp[9..11],
        &stamp[11..13],
        &stamp[13..15]
    );
    let size_bytes = std::fs::metadata(path).ok()?.len();
    let borewell_count = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM borewells WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .ok()
        });
    Some(BackupInfo {
        path: path.to_string_lossy().into_owned(),
        file_name,
        created_at,
        kind: reason.tag().into(),
        label: reason.label().into(),
        size_bytes,
        readable: borewell_count.is_some(),
        borewell_count,
    })
}

fn prune_automatic(dir: &Path) -> Result<()> {
    let mut auto: Vec<PathBuf> = list(dir)?
        .into_iter()
        .filter(|b| b.kind == BackupReason::Automatic.tag())
        .map(|b| PathBuf::from(b.path))
        .collect();
    // `list` is newest first; everything after the first KEEP_AUTOMATIC goes.
    for old in auto.drain(KEEP_AUTOMATIC.min(auto.len())..) {
        std::fs::remove_file(old)?;
    }
    Ok(())
}
