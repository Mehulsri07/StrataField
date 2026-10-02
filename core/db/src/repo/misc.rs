//! Smaller stores: change history, saved cross-sections and the address lookup cache.

use crate::db::{new_id, now};
use crate::error::{DbError, Result};
use crate::models::{HistoryEntry, Section};
use rusqlite::{params, Connection, OptionalExtension};

pub fn history_for(conn: &Connection, entity: &str, entity_id: &str) -> Result<Vec<HistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, entity, entity_id, action, changed_at, summary FROM record_history
         WHERE entity = ?1 AND entity_id = ?2 ORDER BY id DESC",
    )?;
    let rows = stmt.query_map(params![entity, entity_id], |r| {
        Ok(HistoryEntry {
            id: r.get(0)?,
            entity: r.get(1)?,
            entity_id: r.get(2)?,
            action: r.get(3)?,
            changed_at: r.get(4)?,
            summary: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// The newest changes across everything (borewells, imports, soil types...), newest first.
pub fn history_recent(conn: &Connection, limit: i64) -> Result<Vec<HistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, entity, entity_id, action, changed_at, summary FROM record_history
         ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |r| {
        Ok(HistoryEntry {
            id: r.get(0)?,
            entity: r.get(1)?,
            entity_id: r.get(2)?,
            action: r.get(3)?,
            changed_at: r.get(4)?,
            summary: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn list_sections(conn: &Connection) -> Result<Vec<Section>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, line_json, corridor_half_km, settings_json, created_at, updated_at FROM sections ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, f64>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, String>(6)?,
        ))
    })?;
    rows.map(|row| {
        let (id, name, line, corridor_half_km, settings, created_at, updated_at) = row?;
        Ok(Section {
            id,
            name,
            line: serde_json::from_str(&line)?,
            corridor_half_km,
            settings: serde_json::from_str(&settings)?,
            created_at,
            updated_at,
        })
    })
    .collect()
}

/// Saves a cross-section so it can be reopened exactly as it was. An empty id creates a new one.
pub fn save_section(conn: &Connection, s: &Section) -> Result<Section> {
    if s.name.trim().is_empty() {
        return Err(DbError::Invalid("Give the cross-section a name.".into()));
    }
    if s.line.len() < 2 {
        return Err(DbError::Invalid(
            "A cross-section needs a start and an end point.".into(),
        ));
    }
    if s.corridor_half_km <= 0.0 {
        return Err(DbError::Invalid(
            "The distance from the line must be more than zero.".into(),
        ));
    }
    let ts = now();
    let id = if s.id.is_empty() {
        new_id()
    } else {
        s.id.clone()
    };
    conn.execute(
        "INSERT INTO sections (id, name, line_json, corridor_half_km, settings_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, line_json = excluded.line_json,
            corridor_half_km = excluded.corridor_half_km, settings_json = excluded.settings_json, updated_at = excluded.updated_at",
        params![id, s.name.trim(), serde_json::to_string(&s.line)?, s.corridor_half_km, s.settings.to_string(), ts],
    )?;
    list_sections(conn)?
        .into_iter()
        .find(|x| x.id == id)
        .ok_or_else(|| DbError::NotFound("The saved cross-section".into()))
}

pub fn delete_section(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM sections WHERE id = ?1", [id])?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeocodeHit {
    pub latitude: f64,
    pub longitude: f64,
    pub display_name: String,
}

pub fn cached_geocode(conn: &Connection, query: &str) -> Result<Option<GeocodeHit>> {
    Ok(conn
        .query_row(
            "SELECT latitude, longitude, display_name FROM geocoding_cache WHERE query = ?1",
            [normalise_query(query)],
            |r| {
                Ok(GeocodeHit {
                    latitude: r.get(0)?,
                    longitude: r.get(1)?,
                    display_name: r.get(2)?,
                })
            },
        )
        .optional()?)
}

pub fn cache_geocode(conn: &Connection, query: &str, hit: &GeocodeHit) -> Result<()> {
    conn.execute(
        "INSERT INTO geocoding_cache (query, latitude, longitude, display_name, cached_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(query) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude,
            display_name = excluded.display_name, cached_at = excluded.cached_at",
        params![normalise_query(query), hit.latitude, hit.longitude, hit.display_name, now()],
    )?;
    Ok(())
}

pub fn normalise_query(q: &str) -> String {
    q.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
