pub mod attachments;
pub mod borewells;
pub mod layers;
pub mod materials;
pub mod misc;
pub mod projects;

use crate::db::{new_id, now, record_history};
use crate::error::{DbError, Result};
use crate::models::{BorewellInput, BorewellRecord, PipeSegment, StrataLayer};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Everything the detail screen shows for one borewell.
pub fn record(conn: &Connection, data_dir: &Path, id: &str) -> Result<BorewellRecord> {
    Ok(BorewellRecord {
        borewell: borewells::get(conn, id)?,
        strata: layers::strata_for(conn, id)?,
        pipes: layers::pipes_for(conn, id)?,
        water_readings: layers::water_for(conn, id)?,
        photos: attachments::photos_for(conn, data_dir, id)?,
        files: attachments::files_for(conn, data_dir, id)?,
        history: misc::history_for(conn, "borewell", id)?,
    })
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ImportedBorewell {
    pub borewell: BorewellInput,
    pub strata: Vec<StrataLayer>,
    pub pipes: Vec<PipeSegment>,
}

/// One Excel import, after the user has checked the preview and resolved unrecognised names.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ImportRequest {
    pub file_name: String,
    /// The original workbook, copied into the data folder so the source is never lost.
    pub source_path: Option<String>,
    pub unrecognised_names: Vec<String>,
    pub resolutions: serde_json::Value,
    pub borewells: Vec<ImportedBorewell>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub batch_id: String,
    pub borewell_ids: Vec<String>,
}

/// Saves an Excel import as one batch. Run inside a transaction: all borewells are saved, or none.
pub fn import_batch(
    conn: &Connection,
    data_dir: &Path,
    req: &ImportRequest,
) -> Result<ImportResult> {
    if req.borewells.is_empty() {
        return Err(DbError::Invalid(
            "There are no borewells to import in this file.".into(),
        ));
    }
    let batch_id = new_id();
    let stored_path = match &req.source_path {
        Some(src) => Some(copy_import_source(data_dir, &batch_id, Path::new(src))?),
        None => None,
    };
    let resolutions = if req.resolutions.is_null() {
        serde_json::json!({})
    } else {
        req.resolutions.clone()
    };
    conn.execute(
        "INSERT INTO import_batches (id, file_name, stored_path, imported_at, borewell_count, unrecognised_names, resolutions)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            batch_id, req.file_name, stored_path, now(), req.borewells.len() as i64,
            serde_json::to_string(&req.unrecognised_names)?, resolutions.to_string()
        ],
    )?;
    let mut ids = Vec::with_capacity(req.borewells.len());
    for (i, item) in req.borewells.iter().enumerate() {
        let mut input = item.borewell.clone();
        input.import_batch_id = Some(batch_id.clone());
        input.import_method = Some("excel".into());
        input.import_source = Some(req.file_name.clone());
        let b = borewells::create(conn, &input).map_err(|e| {
            DbError::Invalid(format!(
                "Borewell {} in the file could not be imported: {e}",
                i + 1
            ))
        })?;
        if !item.strata.is_empty() {
            layers::replace_strata(conn, &b.id, &item.strata)?;
        }
        if !item.pipes.is_empty() {
            layers::replace_pipes(conn, &b.id, &item.pipes)?;
        }
        ids.push(b.id);
    }
    record_history(
        conn,
        "import",
        &batch_id,
        "import",
        &format!("Imported {} borewells from {}", ids.len(), req.file_name),
        None,
        None,
    )?;
    Ok(ImportResult {
        batch_id,
        borewell_ids: ids,
    })
}

fn copy_import_source(data_dir: &Path, batch_id: &str, source: &Path) -> Result<String> {
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
    let relative: PathBuf = ["attachments", "imports", &format!("{batch_id}{ext}")]
        .iter()
        .collect();
    let dest = data_dir.join(&relative);
    std::fs::create_dir_all(dest.parent().expect("import path has a parent"))?;
    std::fs::copy(source, dest)?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}
