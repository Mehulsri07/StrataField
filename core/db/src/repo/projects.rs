use crate::db::{new_id, now};
use crate::error::Result;
use crate::models::Project;
use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_PROJECT: &str = "Default Project";

pub fn list(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM borewells b WHERE b.project_id = p.id AND b.deleted_at IS NULL)
         FROM projects p ORDER BY p.name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Project {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            created_at: r.get(3)?,
            updated_at: r.get(4)?,
            borewell_count: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Returns the id of the project with this name (case-insensitive), creating it if needed.
/// A blank name means the default project.
pub fn id_for_name(conn: &Connection, name: &str) -> Result<String> {
    let name = if name.trim().is_empty() {
        DEFAULT_PROJECT
    } else {
        name.trim()
    };
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM projects WHERE name = ?1 COLLATE NOCASE",
            [name],
            |r| r.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = new_id();
    let ts = now();
    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, '', ?3, ?3)",
        params![id, name, ts],
    )?;
    Ok(id)
}
