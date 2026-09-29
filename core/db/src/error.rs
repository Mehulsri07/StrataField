use serde::{Serialize, Serializer};

/// Every error the data layer can return. Messages are written for the person using the app,
/// because commands pass them straight to the screen.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("The database could not complete this action: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("A file could not be read or written: {0}")]
    Io(#[from] std::io::Error),

    #[error("Stored data could not be read: {0}")]
    Json(#[from] serde_json::Error),

    #[error(
        "This database was created by a newer version of StrataField (data version {found}). \
         Please update StrataField to open it. This version supports up to data version {supported}."
    )]
    NewerSchema { found: i64, supported: i64 },

    #[error("{0} was not found. It may have been deleted.")]
    NotFound(String),

    #[error("{0}")]
    Invalid(String),

    #[error("The backup file is damaged and cannot be used: {0}")]
    CorruptBackup(String),
}

pub type Result<T> = std::result::Result<T, DbError>;

// Tauri commands return errors to the screen as plain strings.
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
