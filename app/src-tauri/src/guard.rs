//! Checks on file paths that come from the screens.
//!
//! Commands that read or copy a file from elsewhere on the computer only accept a path the user
//! chose in one of this app's file dialogs (the dialog plugin records each choice), with the kind of
//! file the command expects. So even if something went wrong in the screens, they could not make the
//! app read or copy other files.

use std::path::Path;
use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

pub const PHOTOS: &[&str] = &["jpg", "jpeg", "png", "heic", "webp"];
pub const DOCUMENTS: &[&str] = &["pdf", "xlsx", "xls", "xlsm", "csv", "doc", "docx"];
pub const SPREADSHEETS: &[&str] = &["xlsx", "xls", "xlsm", "csv"];
pub const DATABASES: &[&str] = &["db"];

/// The path was chosen by the user in a file dialog during this session.
pub fn chosen_by_user<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<(), String> {
    if app.fs_scope().is_allowed(path) || end_to_end_test() {
        Ok(())
    } else {
        Err("Choose the file again with the Choose button.".into())
    }
}

/// The file has one of the `allowed` extensions (lower case, without the dot).
pub fn has_extension(path: &Path, allowed: &[&str], what: &str) -> Result<(), String> {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if allowed.contains(&ext.as_str()) {
        Ok(())
    } else {
        Err(format!(
            "Choose {what} ({}).",
            allowed
                .iter()
                .map(|e| format!(".{e}"))
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

/// Development builds run by the end-to-end test (e2e/) stand in for the file dialog.
/// Installed (release) builds always require a real choice.
fn end_to_end_test() -> bool {
    cfg!(debug_assertions) && std::env::var_os("STRATA_E2E_DEBUG_PORT").is_some()
}
