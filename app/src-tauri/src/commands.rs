//! Commands the screens call through `invoke`. Each is a thin wrapper over `strata_db`:
//! writes run in one transaction, and errors come back as plain-language strings.

use crate::geocode;
use crate::guard;
use crate::state::{AppState, StartupStatus};
use std::path::PathBuf;
use strata_db::backup::{self, BackupInfo, BackupReason};
use strata_db::legacy::{self, LegacyImportReport};
use strata_db::models::*;
use strata_db::repo::{
    self, attachments, borewells, layers, materials, misc, projects, ImportRequest, ImportResult,
};
use strata_db::Database;
use tauri::{AppHandle, State};

type Res<T> = Result<T, String>;

fn read<T>(
    state: &AppState,
    f: impl FnOnce(&Database, &strata_db::Connection) -> strata_db::Result<T>,
) -> Res<T> {
    let db = state.db()?;
    db.with(|c| f(db, c)).map_err(|e| e.to_string())
}

fn write<T>(
    state: &AppState,
    f: impl FnOnce(&Database, &strata_db::Connection) -> strata_db::Result<T>,
) -> Res<T> {
    let db = state.db()?;
    db.with_tx(|tx| f(db, tx)).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
}

pub fn current_app_info() -> AppInfo {
    AppInfo {
        name: "StrataField".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

/// Lets the screen confirm the backend is reachable and show the running version.
#[tauri::command]
pub fn app_info() -> AppInfo {
    current_app_info()
}

#[tauri::command]
pub fn startup_status(state: State<AppState>) -> StartupStatus {
    state.startup.clone()
}

/// Changes when another Strata app writes to the shared database; screens poll it to refresh.
#[tauri::command]
pub fn data_version(state: State<AppState>) -> Res<i64> {
    state.db()?.data_version().map_err(|e| e.to_string())
}

// ── Borewells ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn borewells_search(
    state: State<AppState>,
    filters: SearchFilters,
) -> Res<Vec<BorewellListItem>> {
    read(&state, |_, c| borewells::search(c, &filters))
}

#[tauri::command]
pub fn borewell_get(state: State<AppState>, id: String) -> Res<BorewellRecord> {
    read(&state, |db, c| repo::record(c, db.data_dir(), &id))
}

#[tauri::command]
pub fn borewell_create(state: State<AppState>, input: BorewellInput) -> Res<Borewell> {
    write(&state, |_, tx| borewells::create(tx, &input))
}

#[tauri::command]
pub fn borewell_update(state: State<AppState>, id: String, input: BorewellInput) -> Res<Borewell> {
    write(&state, |_, tx| borewells::update(tx, &id, &input))
}

/// Moves a borewell to the Recycle bin.
#[tauri::command]
pub fn borewell_delete(state: State<AppState>, id: String) -> Res<()> {
    write(&state, |_, tx| borewells::soft_delete(tx, &id))
}

#[tauri::command]
pub fn borewell_restore(state: State<AppState>, id: String) -> Res<()> {
    write(&state, |_, tx| borewells::restore(tx, &id))
}

/// Deletes a borewell from the Recycle bin for good, including its photos and files.
#[tauri::command]
pub fn borewell_delete_permanently(state: State<AppState>, id: String) -> Res<()> {
    // Its photos and files are set aside, not erased, so an older backup can still bring them back.
    write(&state, |db, tx| {
        for p in borewells::delete_permanently(tx, &id)? {
            attachments::release_file(tx, db.data_dir(), &p)?;
        }
        Ok(())
    })
}

// ── Layers, pipes, water ────────────────────────────────────────────────

#[tauri::command]
pub fn strata_save(
    state: State<AppState>,
    borewell_id: String,
    layers: Vec<StrataLayer>,
) -> Res<Vec<StrataLayer>> {
    write(&state, |_, tx| {
        layers::replace_strata(tx, &borewell_id, &layers)
    })
}

#[tauri::command]
pub fn pipes_save(
    state: State<AppState>,
    borewell_id: String,
    pipes: Vec<PipeSegment>,
) -> Res<Vec<PipeSegment>> {
    write(&state, |_, tx| {
        layers::replace_pipes(tx, &borewell_id, &pipes)
    })
}

#[tauri::command]
pub fn water_reading_add(
    state: State<AppState>,
    borewell_id: String,
    reading: WaterReading,
) -> Res<WaterReading> {
    write(&state, |_, tx| {
        layers::add_water_reading(tx, &borewell_id, &reading)
    })
}

#[tauri::command]
pub fn water_reading_delete(state: State<AppState>, id: String) -> Res<()> {
    write(&state, |_, tx| layers::delete_water_reading(tx, &id))
}

// ── Materials and projects ──────────────────────────────────────────────

#[tauri::command]
pub fn materials_list(state: State<AppState>) -> Res<Vec<Material>> {
    read(&state, |_, c| materials::list(c))
}

#[tauri::command]
pub fn material_create(state: State<AppState>, material: Material) -> Res<Material> {
    write(&state, |_, tx| materials::create(tx, &material))
}

#[tauri::command]
pub fn material_update(state: State<AppState>, material: Material) -> Res<Material> {
    write(&state, |_, tx| materials::update(tx, &material))
}

#[tauri::command]
pub fn material_delete(state: State<AppState>, id: String) -> Res<()> {
    write(&state, |_, tx| materials::delete(tx, &id))
}

#[tauri::command]
pub fn projects_list(state: State<AppState>) -> Res<Vec<Project>> {
    read(&state, |_, c| projects::list(c))
}

#[tauri::command]
pub fn project_rename(state: State<AppState>, id: String, name: String) -> Res<()> {
    write(&state, |_, tx| projects::rename(tx, &id, &name))
}

// ── Photos and files ────────────────────────────────────────────────────

#[tauri::command]
#[allow(clippy::too_many_arguments)] // one argument per value the screens send
pub fn photo_add(
    app: AppHandle,
    state: State<AppState>,
    borewell_id: String,
    source_path: String,
    capture_date: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    caption: Option<String>,
) -> Res<Photo> {
    let source = PathBuf::from(source_path);
    guard::has_extension(&source, guard::PHOTOS, "a photo")?;
    guard::chosen_by_user(&app, &source)?;
    write(&state, |db, tx| {
        attachments::add_photo(
            tx,
            db.data_dir(),
            &borewell_id,
            attachments::NewPhoto {
                source: &source,
                capture_date,
                latitude,
                longitude,
                caption: caption.unwrap_or_default(),
            },
        )
    })
}

#[tauri::command]
pub fn file_add(
    app: AppHandle,
    state: State<AppState>,
    borewell_id: String,
    source_path: String,
) -> Res<Attachment> {
    let source = PathBuf::from(&source_path);
    // Only documents: an attached program could otherwise be started with "Open".
    guard::has_extension(&source, guard::DOCUMENTS, "a document")?;
    guard::chosen_by_user(&app, &source)?;
    write(&state, |db, tx| {
        attachments::add_file(tx, db.data_dir(), &borewell_id, &source)
    })
}

/// `kind` is "photo" or "file".
#[tauri::command]
pub fn attachment_remove(state: State<AppState>, kind: String, id: String) -> Res<()> {
    let table = if kind == "photo" { "photos" } else { "files" };
    write(&state, |db, tx| {
        attachments::remove(tx, db.data_dir(), table, &id)
    })
}

// ── Excel import ────────────────────────────────────────────────────────

#[tauri::command]
pub fn import_save(
    app: AppHandle,
    state: State<AppState>,
    request: ImportRequest,
) -> Res<ImportResult> {
    if let Some(source) = &request.source_path {
        let source = PathBuf::from(source);
        guard::has_extension(&source, guard::SPREADSHEETS, "an Excel file")?;
        guard::chosen_by_user(&app, &source)?;
    }
    write(&state, |db, tx| {
        repo::import_batch(tx, db.data_dir(), &request)
    })
}

// ── Cross-sections ──────────────────────────────────────────────────────

#[tauri::command]
pub fn sections_list(state: State<AppState>) -> Res<Vec<Section>> {
    read(&state, |_, c| misc::list_sections(c))
}

#[tauri::command]
pub fn section_save(state: State<AppState>, section: Section) -> Res<Section> {
    write(&state, |_, tx| misc::save_section(tx, &section))
}

#[tauri::command]
pub fn section_delete(state: State<AppState>, id: String) -> Res<()> {
    write(&state, |_, tx| misc::delete_section(tx, &id))
}

// ── Backups and the older app's data ────────────────────────────────────

#[tauri::command]
pub fn backups_list(state: State<AppState>) -> Res<Vec<BackupInfo>> {
    backup::list(&state.db()?.backups_dir()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_create(state: State<AppState>) -> Res<BackupInfo> {
    let db = state.db()?;
    db.with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .map_err(|e| e.to_string())
}

/// Restores from a backup file (one listed in Settings, or one the user picked).
/// Returns the safety backup taken first, so the restore can be undone.
#[tauri::command]
pub fn backup_restore(app: AppHandle, state: State<AppState>, path: String) -> Res<BackupInfo> {
    let path = PathBuf::from(path);
    let db = state.db()?;
    guard::has_extension(&path, guard::DATABASES, "a StrataField backup")?;
    // A backup from the list (inside the backups folder), or a file the user chose.
    let listed = path
        .parent()
        .zip(db.backups_dir().canonicalize().ok())
        .is_some_and(|(dir, backups)| dir.canonicalize().is_ok_and(|d| d == backups));
    if !listed {
        guard::chosen_by_user(&app, &path)?;
    }
    backup::restore(db, &path).map_err(|e| e.to_string())
}

/// Opens the backups folder (or the whole data folder) in File Explorer. Only these two
/// fixed folders can be opened this way.
#[tauri::command]
pub fn open_folder(app: tauri::AppHandle, state: State<AppState>, which: String) -> Res<()> {
    use tauri_plugin_opener::OpenerExt;
    let data = PathBuf::from(&state.startup.data_folder);
    let dir = match which.as_str() {
        "backups" => data.join("backups"),
        "data" => data,
        _ => return Err("This folder cannot be opened.".into()),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Could not open the folder: {e}"))
}

/// Imports data from the older StrataField app. Start-up does this automatically once;
/// this lets the user bring in another old database file.
#[tauri::command]
pub fn legacy_import(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Res<LegacyImportReport> {
    let path = PathBuf::from(path);
    guard::has_extension(&path, guard::DATABASES, "the older StrataField's data file")?;
    guard::chosen_by_user(&app, &path)?;
    legacy::import(state.db()?, &path).map_err(|e| e.to_string())
}

// ── Settings and address lookup ─────────────────────────────────────────

#[tauri::command]
pub fn setting_get(state: State<AppState>, key: String) -> Res<Option<serde_json::Value>> {
    read(&state, |_, c| strata_db::db::get_setting(c, &key))
}

#[tauri::command]
pub fn setting_set(state: State<AppState>, key: String, value: serde_json::Value) -> Res<()> {
    read(&state, |_, c| strata_db::db::set_setting(c, &key, &value))
}

#[tauri::command]
pub async fn geocode_address(
    state: State<'_, AppState>,
    query: String,
) -> Res<Option<misc::GeocodeHit>> {
    geocode::lookup(&state, &query).await
}

/// Date and GPS position saved inside a photo the user chose.
#[tauri::command]
pub fn photo_metadata(app: AppHandle, path: String) -> Res<crate::photo::PhotoMetadata> {
    let path = PathBuf::from(path);
    guard::has_extension(&path, guard::PHOTOS, "a photo")?;
    guard::chosen_by_user(&app, &path)?;
    crate::photo::read(&path)
}

/// Reads a spreadsheet the user chose, so the screens can parse it. Only spreadsheet files are allowed.
#[tauri::command]
pub fn read_spreadsheet(app: AppHandle, path: String) -> Res<tauri::ipc::Response> {
    let p = PathBuf::from(&path);
    guard::has_extension(&p, guard::SPREADSHEETS, "an Excel file")?;
    guard::chosen_by_user(&app, &p)?;
    std::fs::read(&p)
        .map(tauri::ipc::Response::new)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::PermissionDenied => {
                "The file is open in another program or you do not have access. Close it and try again.".to_string()
            }
            _ => format!("The file could not be read: {e}"),
        })
}

/// Soil names on layers that are not linked to a soil type, with how many layers use each.
#[tauri::command]
pub fn soil_names_unlinked(state: State<AppState>) -> Res<Vec<(String, i64)>> {
    read(&state, |_, c| materials::unlinked_names(c))
}

/// Links every layer with this soil name to a soil type. Returns how many layers changed.
#[tauri::command]
pub fn soil_name_link(state: State<AppState>, name: String, material_id: String) -> Res<usize> {
    write(&state, |_, tx| {
        materials::link_name(tx, &name, &material_id)
    })
}
