//! Database backups: consistent snapshots taken with SQLite's online backup API,
//! verified after writing, pruned by kind, and restorable into the open database.

use crate::db::{self, Database};
use crate::error::{DbError, Result};
use crate::schema;
use chrono::Local;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
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
    // A second copy in the folder the user chose (USB drive, cloud folder), if any. Never fails
    // the backup itself: problems are recorded and shown in Settings and on Home.
    if let Some(data_dir) = dir.parent() {
        copy_to_second_folder(data_dir, &dest);
    }
    // Removed photos and files older than every kept backup can no longer be restored: delete them.
    if let Some(data_dir) = dir.parent() {
        let oldest = list(dir)?.last().map(|b| b.file_name.clone());
        let stamp = oldest
            .as_deref()
            .and_then(|f| f.strip_prefix(PREFIX))
            .and_then(|s| s.get(..15));
        crate::repo::attachments::clean_parked(data_dir, stamp)?;
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
        crate::repo::attachments::bring_back_parked(conn, db.data_dir())?;
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

// ── A second copy somewhere else ──────────────────────────────────────────

/// Backups kept in the second folder (the newest ones).
pub const KEEP_SECOND_COPIES: usize = 10;
/// Backups go into this folder inside the one the user chose, so nothing else there is touched.
pub const SECOND_COPY_SUBFOLDER: &str = "StrataField backups";
/// Kept in the data folder, not in the database: it belongs to this computer (a USB drive's letter
/// means nothing elsewhere) and restoring a backup must not change it.
const SECOND_COPY_FILE: &str = "backup-second-copy.json";

/// Where a second copy of every backup goes, and how the last copy went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SecondCopy {
    /// The folder the user chose; `None` when backups stay only on this computer.
    pub folder: Option<String>,
    /// When a backup was last copied there ("YYYY-MM-DD HH:MM:SS", local time).
    pub last_copied_at: Option<String>,
    /// Why the last copy failed (for example the USB drive was not plugged in); `None` after a success.
    pub last_error: Option<String>,
}

pub fn second_copy(data_dir: &Path) -> SecondCopy {
    std::fs::read_to_string(data_dir.join(SECOND_COPY_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_second_copy(data_dir: &Path, s: &SecondCopy) -> Result<()> {
    std::fs::write(
        data_dir.join(SECOND_COPY_FILE),
        serde_json::to_string_pretty(s)?,
    )?;
    Ok(())
}

/// Chooses the folder for second copies (`None` stops copying). The status starts afresh.
pub fn set_second_copy_folder(data_dir: &Path, folder: Option<&Path>) -> Result<SecondCopy> {
    if let Some(f) = folder {
        if !f.is_dir() {
            return Err(DbError::Invalid("That folder could not be found.".into()));
        }
        let inside_data = match (f.canonicalize(), data_dir.canonicalize()) {
            (Ok(f), Ok(d)) => f.starts_with(d),
            _ => false,
        };
        if inside_data {
            return Err(DbError::Invalid(
                "Choose a folder outside StrataField's own data folder, for example on a USB drive or in OneDrive.".into(),
            ));
        }
    }
    let s = SecondCopy {
        folder: folder.map(|f| f.to_string_lossy().into_owned()),
        ..Default::default()
    };
    save_second_copy(data_dir, &s)?;
    Ok(s)
}

/// Copies `backup` into the second folder (if one is chosen), keeps the newest copies there, and
/// records how it went. Returns the new status.
pub fn copy_to_second_folder(data_dir: &Path, backup: &Path) -> SecondCopy {
    let mut s = second_copy(data_dir);
    let Some(folder) = s.folder.clone() else {
        return s;
    };
    let result = (|| -> std::io::Result<()> {
        let root = Path::new(&folder);
        if !root.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "the folder is not available (is the USB drive plugged in?)",
            ));
        }
        let target = root.join(SECOND_COPY_SUBFOLDER);
        std::fs::create_dir_all(&target)?;
        let name = backup
            .file_name()
            .ok_or_else(|| std::io::Error::other("no file name"))?;
        // Copy under a temporary name first, so a half-written copy never looks like a backup.
        let partial = target.join(format!("{}.copying", name.to_string_lossy()));
        std::fs::copy(backup, &partial)?;
        std::fs::rename(&partial, target.join(name))?;
        let mut copies: Vec<PathBuf> = std::fs::read_dir(&target)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with(PREFIX) && n.ends_with(".db"))
            })
            .collect();
        copies.sort();
        let excess = copies.len().saturating_sub(KEEP_SECOND_COPIES);
        for old in copies.drain(..excess) {
            std::fs::remove_file(old)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            s.last_copied_at = Some(Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
            s.last_error = None;
        }
        Err(e) => s.last_error = Some(format!("Could not copy the backup to {folder}: {e}.")),
    }
    let _ = save_second_copy(data_dir, &s);
    s
}
