use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
pub struct AppInfo {
    name: String,
    version: String,
}

fn current_app_info() -> AppInfo {
    AppInfo {
        name: "StrataField".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

/// Lets the screen confirm the backend is reachable and show the running version.
#[tauri::command]
fn app_info() -> AppInfo {
    current_app_info()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running StrataField");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_package_version() {
        let info = current_app_info();
        assert_eq!(info.name, "StrataField");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
