use crate::db::new_id;
use crate::error::{DbError, Result};
use crate::models::Material;
use rusqlite::{params, Connection, OptionalExtension};

const FAMILIES: [&str; 5] = ["CLAY", "SAND", "ROCK", "OTHER", "NONE"];

pub fn list(conn: &Connection) -> Result<Vec<Material>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, pattern, is_custom, lithology_class, lithology_family
         FROM materials ORDER BY is_custom, sort_order, name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Material {
            id: r.get(0)?,
            name: r.get(1)?,
            color: r.get(2)?,
            pattern: r.get(3)?,
            is_custom: r.get(4)?,
            lithology_class: r.get(5)?,
            lithology_family: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn find_by_name(conn: &Connection, name: &str) -> Result<Option<Material>> {
    Ok(list(conn)?
        .into_iter()
        .find(|m| m.name.eq_ignore_ascii_case(name.trim())))
}

/// Adds a user-defined soil type.
pub fn create(conn: &Connection, m: &Material) -> Result<Material> {
    validate(m)?;
    if find_by_name(conn, &m.name)?.is_some() {
        return Err(DbError::Invalid(format!(
            "A soil type called \u{201c}{}\u{201d} already exists.",
            m.name.trim()
        )));
    }
    let id = if m.id.is_empty() {
        format!("custom_{}", new_id())
    } else {
        m.id.clone()
    };
    let order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM materials",
        [],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO materials (id, name, color, pattern, is_custom, lithology_class, lithology_family, sort_order)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7)",
        params![id, m.name.trim(), m.color, m.pattern, m.lithology_class, m.lithology_family, order],
    )?;
    Ok(Material {
        id,
        is_custom: true,
        name: m.name.trim().into(),
        ..m.clone()
    })
}

/// Changes a soil type's name, colour, pattern or family. Layers that use it keep their link.
pub fn update(conn: &Connection, m: &Material) -> Result<Material> {
    validate(m)?;
    if let Some(other) = find_by_name(conn, &m.name)? {
        if other.id != m.id {
            return Err(DbError::Invalid(format!(
                "A soil type called \u{201c}{}\u{201d} already exists.",
                m.name.trim()
            )));
        }
    }
    let n = conn.execute(
        "UPDATE materials SET name = ?2, color = ?3, pattern = ?4, lithology_class = ?5, lithology_family = ?6 WHERE id = ?1",
        params![m.id, m.name.trim(), m.color, m.pattern, m.lithology_class, m.lithology_family],
    )?;
    if n == 0 {
        return Err(DbError::NotFound("This soil type".into()));
    }
    conn.execute(
        "UPDATE strata_layers SET material = ?2, color = ?3, pattern = ?4 WHERE material_id = ?1",
        params![m.id, m.name.trim(), m.color, m.pattern],
    )?;
    Ok(m.clone())
}

/// Deletes a user-defined soil type that no layer uses. Built-in types cannot be deleted.
pub fn delete(conn: &Connection, id: &str) -> Result<()> {
    let is_custom: Option<bool> = conn
        .query_row("SELECT is_custom FROM materials WHERE id = ?1", [id], |r| {
            r.get(0)
        })
        .optional()?;
    match is_custom {
        None => return Err(DbError::NotFound("This soil type".into())),
        Some(false) => {
            return Err(DbError::Invalid(
                "Built-in soil types cannot be deleted.".into(),
            ))
        }
        Some(true) => {}
    }
    let used: i64 = conn.query_row(
        "SELECT COUNT(*) FROM strata_layers WHERE material_id = ?1",
        [id],
        |r| r.get(0),
    )?;
    if used > 0 {
        return Err(DbError::Invalid(format!(
            "This soil type is used by {used} layers. Change those layers first."
        )));
    }
    conn.execute("DELETE FROM materials WHERE id = ?1", [id])?;
    Ok(())
}

fn validate(m: &Material) -> Result<()> {
    if m.name.trim().is_empty() {
        return Err(DbError::Invalid("Enter a name for the soil type.".into()));
    }
    let hex = m.color.strip_prefix('#').unwrap_or("");
    if !(hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit())) {
        return Err(DbError::Invalid(
            "Choose a colour for the soil type.".into(),
        ));
    }
    if let Some(f) = &m.lithology_family {
        if !FAMILIES.contains(&f.as_str()) {
            return Err(DbError::Invalid(
                "Choose whether the soil type is clay, sand, rock or other.".into(),
            ));
        }
    }
    Ok(())
}

/// Soil names on layers that are not linked to any soil type, with how many layers use each.
pub fn unlinked_names(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT s.material, COUNT(*) FROM strata_layers s JOIN borewells b ON b.id = s.borewell_id
         WHERE s.material_id IS NULL AND b.deleted_at IS NULL AND TRIM(s.material) <> ''
         GROUP BY LOWER(TRIM(s.material)) ORDER BY COUNT(*) DESC, s.material",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Links every unlinked layer called `name` (any capitalisation) to a soil type, taking its
/// name, colour and pattern. Returns how many layers changed.
pub fn link_name(conn: &Connection, name: &str, material_id: &str) -> Result<usize> {
    let m = list(conn)?
        .into_iter()
        .find(|m| m.id == material_id)
        .ok_or_else(|| DbError::NotFound("This soil type".into()))?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT borewell_id FROM strata_layers WHERE material_id IS NULL AND LOWER(TRIM(material)) = LOWER(TRIM(?1))",
    )?;
    let borewells: Vec<String> = stmt
        .query_map([name], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let changed = conn.execute(
        "UPDATE strata_layers SET material_id = ?2, material = ?3, color = ?4, pattern = ?5
         WHERE material_id IS NULL AND LOWER(TRIM(material)) = LOWER(TRIM(?1))",
        params![name, m.id, m.name, m.color, m.pattern],
    )?;
    for b in borewells {
        crate::db::record_history(
            conn,
            "borewell",
            &b,
            "update",
            &format!("Soil name “{}” set to {}", name.trim(), m.name),
            None,
            None,
        )?;
    }
    Ok(changed)
}
