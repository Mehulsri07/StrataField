//! Photos and files. StrataField copies each one into `<data folder>/attachments/<borewell>/`
//! and stores the path relative to the data folder, so backups and moves keep them together.

use crate::db::{managed_path, new_id, now, record_history, resolve_path};
use crate::error::{DbError, Result};
use crate::models::{Attachment, Photo};
use crate::repo::borewells;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

pub struct NewPhoto<'a> {
    pub source: &'a Path,
    pub capture_date: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub caption: String,
}

pub fn photos_for(conn: &Connection, data_dir: &Path, borewell_id: &str) -> Result<Vec<Photo>> {
    let mut stmt = conn.prepare(
        "SELECT id, borewell_id, file_path, capture_date, latitude, longitude, caption, created_at
         FROM photos WHERE borewell_id = ?1 ORDER BY COALESCE(capture_date, created_at)",
    )?;
    let rows = stmt.query_map([borewell_id], |r| {
        Ok(Photo {
            id: r.get(0)?,
            borewell_id: r.get(1)?,
            file_path: resolve_path(data_dir, &r.get::<_, String>(2)?),
            capture_date: r.get(3)?,
            latitude: r.get(4)?,
            longitude: r.get(5)?,
            caption: r.get(6)?,
            created_at: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn files_for(conn: &Connection, data_dir: &Path, borewell_id: &str) -> Result<Vec<Attachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, borewell_id, kind, file_path, original_name, created_at FROM files WHERE borewell_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map([borewell_id], |r| {
        Ok(Attachment {
            id: r.get(0)?,
            borewell_id: r.get(1)?,
            kind: r.get(2)?,
            file_path: resolve_path(data_dir, &r.get::<_, String>(3)?),
            original_name: r.get(4)?,
            created_at: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn add_photo(
    conn: &Connection,
    data_dir: &Path,
    borewell_id: &str,
    p: NewPhoto,
) -> Result<Photo> {
    let b = borewells::get(conn, borewell_id)?;
    let stored = copy_in(data_dir, borewell_id, p.source)?;
    let id = new_id();
    conn.execute(
        "INSERT INTO photos (id, borewell_id, file_path, capture_date, latitude, longitude, caption, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, borewell_id, stored, p.capture_date, p.latitude, p.longitude, p.caption, now()],
    )?;
    record_history(
        conn,
        "borewell",
        borewell_id,
        "update",
        &format!("Added a photo to {}", b.borewell_id),
        None,
        None,
    )?;
    photos_for(conn, data_dir, borewell_id)?
        .into_iter()
        .find(|ph| ph.id == id)
        .ok_or_else(|| DbError::NotFound("The new photo".into()))
}

pub fn add_file(
    conn: &Connection,
    data_dir: &Path,
    borewell_id: &str,
    source: &Path,
) -> Result<Attachment> {
    let b = borewells::get(conn, borewell_id)?;
    let stored = copy_in(data_dir, borewell_id, source)?;
    let original_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let id = new_id();
    conn.execute(
        "INSERT INTO files (id, borewell_id, kind, file_path, original_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, borewell_id, kind_of(source), stored, original_name, now()],
    )?;
    record_history(
        conn,
        "borewell",
        borewell_id,
        "update",
        &format!("Added {original_name} to {}", b.borewell_id),
        None,
        None,
    )?;
    files_for(conn, data_dir, borewell_id)?
        .into_iter()
        .find(|f| f.id == id)
        .ok_or_else(|| DbError::NotFound("The new file".into()))
}

/// Removes a photo or file record (`table` is "photos" or "files") and, if StrataField manages
/// the file, the file itself. Files the old app left elsewhere on disk are not touched.
pub fn remove(conn: &Connection, data_dir: &Path, table: &str, id: &str) -> Result<()> {
    if table != "photos" && table != "files" {
        return Err(DbError::Invalid("Unknown attachment type.".into()));
    }
    let (borewell_id, stored): (String, String) = conn
        .query_row(
            &format!("SELECT borewell_id, file_path FROM {table} WHERE id = ?1"),
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| DbError::NotFound("This attachment".into()))?;
    conn.execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])?;
    release_file(conn, data_dir, &stored)?;
    let what = if table == "photos" {
        "a photo"
    } else {
        "a file"
    };
    record_history(
        conn,
        "borewell",
        &borewell_id,
        "update",
        &format!("Removed {what}"),
        None,
        None,
    )
}

/// Folder inside the data folder where removed photos and files wait, so that restoring a backup
/// made before they were removed can bring them back. One subfolder per removal time.
pub const PARKED_DIR: &str = "removed-files";

/// Called after a photo or file row is deleted. If nothing else still uses the stored file (an
/// Excel import's original is shared by every borewell in that file), it is moved to
/// [`PARKED_DIR`] rather than deleted. Files outside the data folder are never touched.
pub fn release_file(conn: &Connection, data_dir: &Path, stored: &str) -> Result<()> {
    if managed_path(data_dir, stored).is_none() {
        return Ok(());
    }
    let still_used: i64 = conn.query_row(
        "SELECT (SELECT COUNT(*) FROM photos WHERE file_path = ?1)
              + (SELECT COUNT(*) FROM files WHERE file_path = ?1)
              + (SELECT COUNT(*) FROM import_batches WHERE stored_path = ?1)",
        [stored],
        |r| r.get(0),
    )?;
    if still_used == 0 {
        park_file(data_dir, stored);
    }
    Ok(())
}

fn park_file(data_dir: &Path, stored: &str) {
    let Some(from) = managed_path(data_dir, stored) else {
        return;
    };
    if !from.is_file() {
        return;
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let to = data_dir.join(PARKED_DIR).join(stamp).join(stored);
    if let Some(parent) = to.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // If the move fails the file simply stays where it was; it is never deleted here.
    let _ = std::fs::rename(&from, &to);
}

/// After a restore: puts back any removed photos and files that the restored data uses again.
/// Returns how many were brought back.
pub fn bring_back_parked(conn: &Connection, data_dir: &Path) -> Result<usize> {
    let parked_root = data_dir.join(PARKED_DIR);
    if !parked_root.is_dir() {
        return Ok(0);
    }
    let mut batches: Vec<PathBuf> = std::fs::read_dir(&parked_root)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    batches.sort();
    batches.reverse(); // newest first
    let mut stmt = conn.prepare(
        "SELECT file_path FROM photos UNION SELECT file_path FROM files
         UNION SELECT stored_path FROM import_batches WHERE stored_path IS NOT NULL",
    )?;
    let used: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut brought = 0;
    for stored in &used {
        let Some(dest) = managed_path(data_dir, stored) else {
            continue;
        };
        if dest.exists() {
            continue;
        }
        if let Some(src) = batches.iter().map(|b| b.join(stored)).find(|p| p.is_file()) {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            if std::fs::rename(&src, &dest).is_ok() {
                brought += 1;
            }
        }
    }
    Ok(brought)
}

/// Deletes removed files that no kept backup can refer to any more: those removed before the
/// oldest backup was made (all of them when there are no backups).
pub fn clean_parked(data_dir: &Path, oldest_backup_stamp: Option<&str>) -> Result<()> {
    let parked_root = data_dir.join(PARKED_DIR);
    if !parked_root.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&parked_root)?.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        let expired = match oldest_backup_stamp {
            Some(oldest) => name.as_str() < oldest,
            None => true,
        };
        if expired && entry.path().is_dir() {
            std::fs::remove_dir_all(entry.path())?;
        }
    }
    Ok(())
}

pub(crate) fn copy_in(data_dir: &Path, borewell_id: &str, source: &Path) -> Result<String> {
    if !source.is_file() {
        return Err(DbError::Invalid(format!(
            "The file {} could not be found.",
            source.display()
        )));
    }
    let ext = source
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    let folder = safe_folder_name(borewell_id);
    let relative: PathBuf = ["attachments", &folder, &format!("{}{ext}", new_id())]
        .iter()
        .collect();
    let dest = data_dir.join(&relative);
    std::fs::create_dir_all(dest.parent().expect("attachment path has a parent"))?;
    std::fs::copy(source, &dest)?;
    // Forward slashes keep stored paths portable between machines.
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

/// A borewell's ID as a folder name: letters, digits, "-" and "_" only. IDs made by this app are
/// already like that; IDs from older or imported data might not be.
fn safe_folder_name(id: &str) -> String {
    let name: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if name.trim_matches('_').is_empty() {
        "borewell".into()
    } else {
        name
    }
}

fn kind_of(p: &Path) -> &'static str {
    match p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("xlsx" | "xls" | "xlsm" | "csv") => "excel",
        Some("pdf") => "pdf",
        _ => "other",
    }
}
