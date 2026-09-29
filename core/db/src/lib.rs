//! strata_db — the shared StrataField database.
//!
//! One SQLite file (`strata.db`) in a shared data folder, used by every Strata app.
//! Schema changes happen only through `schema::MIGRATIONS`.

pub mod backup;
pub mod db;
pub mod error;
pub mod legacy;
pub mod models;
pub mod repo;
pub mod schema;

pub use db::{Database, OpenReport};
pub use error::{DbError, Result};
// Re-exported so apps can name connection types without their own rusqlite dependency.
pub use rusqlite::{Connection, Transaction};
