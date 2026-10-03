//! Opening the shared database when the app starts.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use strata_db::backup::{self, BackupReason};
use strata_db::legacy::{self, LegacyImportReport};
use strata_db::{Database, DbError, OpenReport};

/// Name of the folder, inside the roaming app-data folder, that every Strata app shares.
pub const SHARED_FOLDER: &str = "Strata";

/// How old the newest automatic backup may be before start-up takes a new one.
const AUTO_BACKUP_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

pub struct AppState {
    pub db: Option<Database>,
    pub startup: StartupStatus,
}

/// What happened at start-up, shown by the screens (for example a one-time
/// "your data was brought over" message, or why the database could not open).
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub data_folder: String,
    pub open: Option<OpenReport>,
    pub legacy_import: Option<LegacyImportReport>,
    pub legacy_import_error: Option<String>,
    pub automatic_backup: Option<String>,
    pub error: Option<String>,
}

impl AppState {
    pub fn db(&self) -> Result<&Database, String> {
        self.db.as_ref().ok_or_else(|| {
            self.startup
                .error
                .clone()
                .unwrap_or_else(|| "The database is not available.".into())
        })
    }
}

/// Where the shared data lives, and where to look for the older Electron app's data.
pub struct Locations {
    pub data_dir: PathBuf,
    /// Folder that contains `StrataField\stratafield.db` from the older app; `None` skips the import.
    pub legacy_root: Option<PathBuf>,
}

impl Locations {
    /// `%APPDATA%\Strata`, with old data looked for in `%APPDATA%\StrataField`.
    pub fn standard(roaming_app_data: &Path) -> Self {
        Self {
            data_dir: roaming_app_data.join(SHARED_FOLDER),
            legacy_root: Some(roaming_app_data.to_path_buf()),
        }
    }

    /// For development and automated testing only: `STRATA_DATA_DIR` puts the database somewhere
    /// else (so tests never touch real data), and `STRATA_LEGACY_ROOT` says where to look for old data.
    pub fn from_env_or(roaming_app_data: &Path) -> Self {
        match std::env::var_os("STRATA_DATA_DIR") {
            Some(dir) => Self {
                data_dir: PathBuf::from(dir),
                legacy_root: std::env::var_os("STRATA_LEGACY_ROOT").map(PathBuf::from),
            },
            None => Self::standard(roaming_app_data),
        }
    }
}

/// Opens `<data folder>/strata.db`. On the very first run it brings over the older Electron app's
/// data, if any. Failures are captured in `StartupStatus` so the app can still open and explain
/// what went wrong.
pub fn start(locations: &Locations) -> AppState {
    let data_dir = locations.data_dir.clone();
    let mut status = StartupStatus {
        data_folder: data_dir.to_string_lossy().into_owned(),
        ..Default::default()
    };

    let db = match Database::open(&data_dir) {
        Ok((db, report)) => {
            status.open = Some(report);
            Some(db)
        }
        Err(e) => {
            status.error = Some(e.to_string());
            None
        }
    };

    if let (Some(db), Some(legacy_root)) = (&db, &locations.legacy_root) {
        bring_over_legacy_data(db, legacy_root, &mut status);
    }
    if let Some(db) = &db {
        status.automatic_backup = automatic_backup_if_due(db).ok().flatten();
    }
    AppState {
        db,
        startup: status,
    }
}

fn bring_over_legacy_data(db: &Database, roaming_app_data: &Path, status: &mut StartupStatus) {
    let Some(old) = legacy::find_legacy_database(roaming_app_data) else {
        return;
    };
    match db.with(legacy::already_imported) {
        Ok(false) => {}
        _ => return,
    }
    match legacy::import(db, &old) {
        Ok(report) => status.legacy_import = Some(report),
        Err(e) => status.legacy_import_error = Some(e.to_string()),
    }
}

/// Takes an automatic backup if there is data and none was taken in the last day.
pub fn automatic_backup_if_due(db: &Database) -> Result<Option<String>, DbError> {
    if db.with(strata_db::repo::borewells::count_active)? == 0 {
        return Ok(None);
    }
    let newest_auto: Option<PathBuf> = backup::list(&db.backups_dir())?
        .into_iter()
        .find(|b| b.kind == "auto")
        .map(|b| PathBuf::from(b.path));
    let due = match newest_auto.and_then(|p| std::fs::metadata(p).ok()?.modified().ok()) {
        Some(modified) => {
            SystemTime::now()
                .duration_since(modified)
                .unwrap_or_default()
                >= AUTO_BACKUP_EVERY
        }
        None => true,
    };
    if !due {
        return Ok(None);
    }
    Ok(Some(
        db.with(|c| backup::create(c, &db.backups_dir(), BackupReason::Automatic))?
            .file_name,
    ))
}
