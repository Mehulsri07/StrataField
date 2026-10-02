//! Help when something goes wrong: a small error log that stays on this computer, and a summary the
//! user can copy into a message to whoever supports them ("Copy details for support").
//!
//! Nothing is ever sent anywhere by the app. The summary holds versions, counts and recent errors,
//! never borewell details such as owners or locations, and the user sees it before copying.

use crate::state::AppState;
use std::io::Write;
use std::path::{Path, PathBuf};
use strata_db::backup;
use tauri::{AppHandle, State};

/// The log is kept small: when it passes this size it becomes `strata.log.1` (replacing an older one).
const MAX_LOG_BYTES: u64 = 256 * 1024;
const MAX_MESSAGE_CHARS: usize = 600;

pub fn log_file(data_dir: &Path) -> PathBuf {
    data_dir.join("logs").join("strata.log")
}

/// Adds a line to the log. Never fails: logging must not cause problems of its own.
pub fn log_line(data_dir: &Path, level: &str, source: &str, message: &str) {
    let file = log_file(data_dir);
    let _ = (|| -> std::io::Result<()> {
        std::fs::create_dir_all(file.parent().expect("log file has a folder"))?;
        if std::fs::metadata(&file).is_ok_and(|m| m.len() > MAX_LOG_BYTES) {
            std::fs::rename(&file, file.with_extension("log.1"))?;
        }
        let message: String = message
            .replace(['\r', '\n'], " ")
            .chars()
            .take(MAX_MESSAGE_CHARS)
            .collect();
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file)?;
        writeln!(
            f,
            "{} {level:<5} [{}] {message}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            source.chars().take(60).collect::<String>()
        )
    })();
}

/// Records an error the screens ran into (a failed command, or a problem in the screens themselves).
#[tauri::command]
pub fn log_error(state: State<AppState>, source: String, message: String) {
    log_line(
        Path::new(&state.startup.data_folder),
        "ERROR",
        &source,
        &message,
    );
}

/// Opens the error log in the usual program for text files (Notepad).
#[tauri::command]
pub fn open_log(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let file = log_file(Path::new(&state.startup.data_folder));
    if !file.is_file() {
        return Err("The log is empty: nothing has gone wrong on this computer.".into());
    }
    app.opener()
        .open_path(file.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Could not open the log: {e}"))
}

/// The text for "Copy details for support".
#[tauri::command]
pub fn support_details(app: AppHandle, state: State<AppState>) -> String {
    let data_dir = PathBuf::from(&state.startup.data_folder);
    let mut out = Vec::<String>::new();
    let mut line = |label: &str, value: String| out.push(format!("{label:<22}{value}"));

    line("StrataField", app.package_info().version.to_string());
    line("Windows", windows_version());
    line(
        "WebView2",
        tauri::webview_version().unwrap_or_else(|e| format!("unknown ({e})")),
    );
    line("Data folder", data_dir.to_string_lossy().into_owned());

    match state.db() {
        Ok(db) => {
            let counts = db.with(|c| {
                let count = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0));
                Ok((
                    strata_db::schema::current_version(c)?,
                    count("SELECT COUNT(*) FROM borewells WHERE deleted_at IS NULL")?,
                    count("SELECT COUNT(*) FROM borewells WHERE deleted_at IS NOT NULL")?,
                    count("SELECT COUNT(*) FROM strata_layers")?,
                    count("SELECT COUNT(*) FROM photos")?,
                    count("SELECT COUNT(*) FROM files")?,
                ))
            });
            match counts {
                Ok((schema, active, bin, layers, photos, files)) => {
                    line("Database version", schema.to_string());
                    line(
                        "Borewells",
                        format!("{active} (and {bin} in the Recycle bin)"),
                    );
                    line(
                        "Layers, photos, files",
                        format!("{layers}, {photos}, {files}"),
                    );
                }
                Err(e) => line("Database", format!("could not be read: {e}")),
            }
            let backups = backup::list(&db.backups_dir()).unwrap_or_default();
            line(
                "Backups",
                match backups.first() {
                    Some(b) => format!("{} (newest {}, {})", backups.len(), b.created_at, b.label),
                    None => "none".into(),
                },
            );
            let second = backup::second_copy(&data_dir);
            line(
                "Second copy",
                match (&second.folder, &second.last_error, &second.last_copied_at) {
                    (None, _, _) => "not set up".into(),
                    (Some(_), Some(e), _) => format!("failing: {e}"),
                    (Some(_), None, Some(t)) => format!("last copied {t}"),
                    (Some(_), None, None) => "not copied yet".into(),
                },
            );
        }
        Err(e) => line("Database", format!("not open: {e}")),
    }
    if let Some(e) = &state.startup.error {
        line("Start-up problem", e.clone());
    }
    line(
        "Map without internet",
        if data_dir.join("maps").join("lucknow.pmtiles").is_file() {
            "downloaded".into()
        } else {
            "not downloaded".into()
        },
    );

    out.push(String::new());
    out.push("Recent errors (newest last):".into());
    let recent = recent_log_lines(&data_dir, 30);
    if recent.is_empty() {
        out.push("  none".into());
    } else {
        out.extend(recent.into_iter().map(|l| format!("  {l}")));
    }
    out.join("\n")
}

fn recent_log_lines(data_dir: &Path, n: usize) -> Vec<String> {
    let file = log_file(data_dir);
    let mut lines: Vec<String> = [file.with_extension("log.1"), file]
        .iter()
        .filter_map(|f| std::fs::read_to_string(f).ok())
        .flat_map(|s| s.lines().map(str::to_owned).collect::<Vec<_>>())
        .collect();
    let skip = lines.len().saturating_sub(n);
    lines.drain(..skip);
    lines
}

fn windows_version() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Ok(out) = std::process::Command::new("cmd")
            .args(["/c", "ver"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !text.is_empty() {
                return text;
            }
        }
    }
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_log_keeps_one_line_per_message_and_stays_small() {
        let dir = std::env::temp_dir().join(format!("strata-log-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        log_line(&dir, "ERROR", "borewell_get", "first\nproblem");
        log_line(&dir, "ERROR", "screens", &"x".repeat(5000));
        let lines = recent_log_lines(&dir, 10);
        assert_eq!(lines.len(), 2);
        assert!(
            lines[0].ends_with("[borewell_get] first problem"),
            "{}",
            lines[0]
        );
        assert!(lines[1].len() < MAX_MESSAGE_CHARS + 60);

        // Past the size limit the log starts afresh, keeping the previous one.
        for _ in 0..600 {
            log_line(&dir, "ERROR", "screens", &"y".repeat(500));
        }
        assert!(std::fs::metadata(log_file(&dir)).unwrap().len() <= MAX_LOG_BYTES + 1024);
        assert!(log_file(&dir).with_extension("log.1").is_file());
        assert_eq!(recent_log_lines(&dir, 30).len(), 30);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
