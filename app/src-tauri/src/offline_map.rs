//! The map for use without internet: one file with Lucknow's streets and places, made from
//! OpenStreetMap data (a Protomaps "PMTiles" file) and published with the project's releases.
//! It is downloaded once from Settings and then drawn by the screens, online or offline.
//!
//! OpenStreetMap's own tile servers do not allow bulk downloading for offline use, which is why the
//! map comes from this separately built file instead.

use crate::state::AppState;
use serde::Serialize;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

/// Built by `.github/workflows/map-data.yml` and attached to the `map-data-lucknow` release.
const MAP_URL: &str =
    "https://github.com/Mehulsri07/StrataField/releases/download/map-data-lucknow/lucknow.pmtiles";
const USER_AGENT: &str = concat!(
    "StrataField/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/Mehulsri07/StrataField)"
);
/// Largest piece the screens may read at once (the map file is read in small ranges).
const MAX_READ: u64 = 16 * 1024 * 1024;

fn map_file(state: &AppState) -> PathBuf {
    PathBuf::from(&state.startup.data_folder)
        .join("maps")
        .join("lucknow.pmtiles")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineMapStatus {
    pub installed: bool,
    pub size_bytes: u64,
    /// When it was downloaded, as "YYYY-MM-DD HH:MM:SS" local time.
    pub downloaded_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    received: u64,
    total: Option<u64>,
}

#[tauri::command]
pub fn offline_map_status(state: State<AppState>) -> Result<OfflineMapStatus, String> {
    let path = map_file(&state);
    Ok(match std::fs::metadata(&path) {
        Ok(m) if m.is_file() => OfflineMapStatus {
            installed: true,
            size_bytes: m.len(),
            downloaded_at: m.modified().ok().map(|t| {
                chrono::DateTime::<chrono::Local>::from(t)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
            }),
        },
        _ => OfflineMapStatus {
            installed: false,
            size_bytes: 0,
            downloaded_at: None,
        },
    })
}

/// Downloads the map file, reporting progress as `offline-map-progress` events. The old file (if
/// any) is only replaced once the new one has fully arrived and looks like a map file.
#[tauri::command]
pub async fn offline_map_download(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<OfflineMapStatus, String> {
    let dest = map_file(&state);
    let dir = dest.parent().expect("map file has a folder").to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let partial = dir.join("lucknow.pmtiles.download");

    let offline = |e: reqwest::Error| {
        format!(
            "The map could not be downloaded. Check the internet connection and try again. ({e})"
        )
    };
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client.get(MAP_URL).send().await.map_err(offline)?;
    if !response.status().is_success() {
        return Err(format!(
            "The map is not available to download right now (the server answered {}).",
            response.status()
        ));
    }
    let total = response.content_length();
    let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut last_report: u64 = 0;
    while let Some(chunk) = response.chunk().await.map_err(offline)? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if received - last_report >= 512 * 1024 {
            last_report = received;
            let _ = app.emit("offline-map-progress", Progress { received, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let _ = app.emit("offline-map-progress", Progress { received, total });

    if total.is_some_and(|t| t != received) || !looks_like_map(&partial) {
        let _ = std::fs::remove_file(&partial);
        return Err("The downloaded map was incomplete. Try again.".into());
    }
    std::fs::rename(&partial, &dest).map_err(|e| e.to_string())?;
    offline_map_status(state)
}

#[tauri::command]
pub fn offline_map_remove(state: State<AppState>) -> Result<(), String> {
    match std::fs::remove_file(map_file(&state)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Reads `length` bytes at `offset` from the map file, for drawing the map.
#[tauri::command]
pub fn offline_map_read(
    state: State<AppState>,
    offset: u64,
    length: u64,
) -> Result<tauri::ipc::Response, String> {
    let mut file = std::fs::File::open(map_file(&state))
        .map_err(|_| "The downloaded map is missing. Download it again in Settings.".to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let length = length.min(MAX_READ).min(size.saturating_sub(offset));
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; length as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(buf))
}

/// A PMTiles version 3 file starts with "PMTiles" and the version byte 3.
fn looks_like_map(path: &std::path::Path) -> bool {
    let mut head = [0u8; 8];
    std::fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut head))
        .is_ok()
        && &head[..7] == b"PMTiles"
        && head[7] == 3
}
