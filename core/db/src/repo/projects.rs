use crate::db::{new_id, now};
use crate::error::{DbError, Result};
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

/// Renames a zone. If another zone already has that name (ignoring case), the two are merged:
/// every borewell moves to the other zone, including those in the Recycle bin, and this one is removed.
pub fn rename(conn: &Connection, id: &str, new_name: &str) -> Result<()> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err(DbError::Invalid("Enter a name for the zone.".into()));
    }
    let other: Option<String> = conn
        .query_row(
            "SELECT id FROM projects WHERE name = ?1 COLLATE NOCASE AND id <> ?2",
            params![new_name, id],
            |r| r.get(0),
        )
        .optional()?;
    let changed = match other {
        Some(other) => {
            conn.execute(
                "UPDATE borewells SET project_id = ?2 WHERE project_id = ?1",
                params![id, other],
            )?;
            conn.execute("DELETE FROM projects WHERE id = ?1", [id])?
        }
        None => conn.execute(
            "UPDATE projects SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, new_name, now()],
        )?,
    };
    if changed == 0 {
        return Err(DbError::NotFound("This zone".into()));
    }
    Ok(())
}
