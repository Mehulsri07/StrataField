mod commands;
mod geocode;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // %APPDATA% (roaming). The shared database lives in %APPDATA%\Strata, and the older
            // Electron app's data (if any) in %APPDATA%\StrataField.
            let roaming = app.path().data_dir()?;
            app.manage(state::start(&roaming));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::startup_status,
            commands::data_version,
            commands::borewells_search,
            commands::borewell_get,
            commands::borewell_create,
            commands::borewell_update,
            commands::borewell_delete,
            commands::borewell_restore,
            commands::borewell_delete_permanently,
            commands::strata_save,
            commands::pipes_save,
            commands::water_reading_add,
            commands::water_reading_delete,
            commands::materials_list,
            commands::material_create,
            commands::material_update,
            commands::material_delete,
            commands::projects_list,
            commands::project_rename,
            commands::photo_add,
            commands::file_add,
            commands::attachment_remove,
            commands::import_save,
            commands::sections_list,
            commands::section_save,
            commands::section_delete,
            commands::backups_list,
            commands::backup_create,
            commands::backup_restore,
            commands::legacy_import,
            commands::setting_get,
            commands::setting_set,
            commands::geocode_address,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting StrataField");

    app.run(|handle, event| {
        // Take the daily automatic backup on the way out too, so a long session is covered.
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<state::AppState>() {
                if let Some(db) = &state.db {
                    let _ = state::automatic_backup_if_due(db);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_package_version() {
        let info = serde_json::to_value(commands::current_app_info()).unwrap();
        assert_eq!(info["name"], "StrataField");
        assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn startup_creates_the_shared_database_and_brings_over_old_data_once() {
        let roaming = std::env::temp_dir().join(format!("strata-startup-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&roaming);
        let old_dir = roaming.join("StrataField");
        std::fs::create_dir_all(&old_dir).unwrap();
        {
            let c = strata_db::Connection::open(old_dir.join("stratafield.db")).unwrap();
            c.execute_batch(
                "CREATE TABLE borewells (id TEXT PRIMARY KEY, borewell_id TEXT, project TEXT, owner_name TEXT, city TEXT, date TEXT, created_at TEXT, updated_at TEXT);
                 INSERT INTO borewells VALUES ('old1','BW-OLD','Default Project','Asha','Lucknow','2025-01-01','2025-01-01T00:00:00Z','2025-01-01T00:00:00Z');",
            )
            .unwrap();
        }

        let first = state::start(&roaming);
        assert!(first.startup.error.is_none(), "{:?}", first.startup.error);
        assert!(roaming.join("Strata").join("strata.db").exists());
        assert_eq!(
            first.startup.legacy_import.as_ref().map(|r| r.borewells),
            Some(1)
        );
        assert!(
            first.startup.automatic_backup.is_some(),
            "first start with data takes a backup"
        );
        drop(first);

        let second = state::start(&roaming);
        assert!(
            second.startup.legacy_import.is_none(),
            "old data is brought over only once"
        );
        assert!(
            second.startup.automatic_backup.is_none(),
            "one automatic backup a day"
        );
        drop(second);
        let _ = std::fs::remove_dir_all(&roaming);
    }
}
