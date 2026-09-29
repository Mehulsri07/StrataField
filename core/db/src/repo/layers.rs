//! Strata layers, pipe segments and water readings belonging to one borewell.

use crate::db::{new_id, record_history};
use crate::error::{DbError, Result};
use crate::models::{PipeSegment, StrataLayer, WaterReading};
use crate::repo::{borewells, materials};
use rusqlite::{params, Connection};

pub fn strata_for(conn: &Connection, borewell_id: &str) -> Result<Vec<StrataLayer>> {
    let mut stmt = conn.prepare(
        "SELECT id, borewell_id, start_depth, end_depth, material, material_id, color, pattern, remarks, water_bearing
         FROM strata_layers WHERE borewell_id = ?1 ORDER BY start_depth, end_depth",
    )?;
    let rows = stmt.query_map([borewell_id], |r| {
        Ok(StrataLayer {
            id: r.get(0)?,
            borewell_id: r.get(1)?,
            start_depth: r.get(2)?,
            end_depth: r.get(3)?,
            material: r.get(4)?,
            material_id: r.get(5)?,
            color: r.get(6)?,
            pattern: r.get(7)?,
            remarks: r.get(8)?,
            water_bearing: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Replaces all layers of a borewell. Gaps and overlaps are allowed here (the editor warns about
/// them, and "Not recorded" layers are valid data); impossible values are refused.
pub fn replace_strata(
    conn: &Connection,
    borewell_id: &str,
    layers: &[StrataLayer],
) -> Result<Vec<StrataLayer>> {
    let b = borewells::get(conn, borewell_id)?;
    let known = materials::list(conn)?;
    for (i, l) in layers.iter().enumerate() {
        check_interval(i + 1, "Layer", l.start_depth, l.end_depth)?;
        if l.material.trim().is_empty() && l.material_id.is_none() {
            return Err(DbError::Invalid(format!(
                "Layer {} needs a soil type.",
                i + 1
            )));
        }
    }
    let before = serde_json::to_value(strata_for(conn, borewell_id)?)?;
    conn.execute(
        "DELETE FROM strata_layers WHERE borewell_id = ?1",
        [borewell_id],
    )?;
    let mut insert = conn.prepare(
        "INSERT INTO strata_layers (id, borewell_id, start_depth, end_depth, material, material_id, color, pattern, remarks, water_bearing)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )?;
    for l in layers {
        // Fill name, colour and pattern from the material library when the screen sent only an id.
        let m = l
            .material_id
            .as_ref()
            .and_then(|id| known.iter().find(|m| &m.id == id));
        let material_id = m.map(|m| m.id.clone());
        let name = if l.material.trim().is_empty() {
            m.map(|m| m.name.clone()).unwrap_or_default()
        } else {
            l.material.trim().to_string()
        };
        let color = if l.color.is_empty() {
            m.map(|m| m.color.clone())
                .unwrap_or_else(|| "#9AA4AD".into())
        } else {
            l.color.clone()
        };
        let pattern = if l.pattern.is_empty() {
            m.map(|m| m.pattern.clone())
                .unwrap_or_else(|| "solid".into())
        } else {
            l.pattern.clone()
        };
        let id = if l.id.is_empty() {
            new_id()
        } else {
            l.id.clone()
        };
        insert.execute(params![
            id,
            borewell_id,
            l.start_depth,
            l.end_depth,
            name,
            material_id,
            color,
            pattern,
            l.remarks,
            l.water_bearing
        ])?;
    }
    let after = strata_for(conn, borewell_id)?;
    record_history(
        conn,
        "borewell",
        borewell_id,
        "update",
        &format!("Saved {} soil layers for {}", after.len(), b.borewell_id),
        Some(&before),
        Some(&serde_json::to_value(&after)?),
    )?;
    touch(conn, borewell_id)?;
    Ok(after)
}

pub fn pipes_for(conn: &Connection, borewell_id: &str) -> Result<Vec<PipeSegment>> {
    let mut stmt = conn.prepare(
        "SELECT id, borewell_id, start_depth, end_depth, pipe_type, pipe_subtype, diameter
         FROM pipe_assemblies WHERE borewell_id = ?1 ORDER BY start_depth, end_depth",
    )?;
    let rows = stmt.query_map([borewell_id], |r| {
        Ok(PipeSegment {
            id: r.get(0)?,
            borewell_id: r.get(1)?,
            start_depth: r.get(2)?,
            end_depth: r.get(3)?,
            pipe_type: r.get(4)?,
            pipe_subtype: r.get(5)?,
            diameter: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn replace_pipes(
    conn: &Connection,
    borewell_id: &str,
    pipes: &[PipeSegment],
) -> Result<Vec<PipeSegment>> {
    let b = borewells::get(conn, borewell_id)?;
    for (i, p) in pipes.iter().enumerate() {
        check_interval(i + 1, "Pipe piece", p.start_depth, p.end_depth)?;
        if p.pipe_type != "plain" && p.pipe_type != "slotted" {
            return Err(DbError::Invalid(format!(
                "Pipe piece {} must be plain pipe or screen pipe.",
                i + 1
            )));
        }
    }
    let before = serde_json::to_value(pipes_for(conn, borewell_id)?)?;
    conn.execute(
        "DELETE FROM pipe_assemblies WHERE borewell_id = ?1",
        [borewell_id],
    )?;
    let mut insert = conn.prepare(
        "INSERT INTO pipe_assemblies (id, borewell_id, start_depth, end_depth, pipe_type, pipe_subtype, diameter)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for p in pipes {
        let id = if p.id.is_empty() {
            new_id()
        } else {
            p.id.clone()
        };
        insert.execute(params![
            id,
            borewell_id,
            p.start_depth,
            p.end_depth,
            p.pipe_type,
            p.pipe_subtype,
            p.diameter
        ])?;
    }
    let after = pipes_for(conn, borewell_id)?;
    record_history(
        conn,
        "borewell",
        borewell_id,
        "update",
        &format!("Saved {} pipe pieces for {}", after.len(), b.borewell_id),
        Some(&before),
        Some(&serde_json::to_value(&after)?),
    )?;
    touch(conn, borewell_id)?;
    Ok(after)
}

pub fn water_for(conn: &Connection, borewell_id: &str) -> Result<Vec<WaterReading>> {
    let mut stmt = conn.prepare(
        "SELECT id, borewell_id, measured_on, static_level, dynamic_level, source, remarks
         FROM water_readings WHERE borewell_id = ?1 ORDER BY measured_on DESC",
    )?;
    let rows = stmt.query_map([borewell_id], |r| {
        Ok(WaterReading {
            id: r.get(0)?,
            borewell_id: r.get(1)?,
            measured_on: r.get(2)?,
            static_level: r.get(3)?,
            dynamic_level: r.get(4)?,
            source: r.get(5)?,
            remarks: r.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Adds a dated water reading. The borewell's current water level follows its newest reading.
pub fn add_water_reading(
    conn: &Connection,
    borewell_id: &str,
    reading: &WaterReading,
) -> Result<WaterReading> {
    let b = borewells::get(conn, borewell_id)?;
    if reading.measured_on.trim().is_empty() {
        return Err(DbError::Invalid(
            "Enter the date the water level was measured.".into(),
        ));
    }
    if reading.static_level.is_none() && reading.dynamic_level.is_none() {
        return Err(DbError::Invalid("Enter a water level.".into()));
    }
    if [reading.static_level, reading.dynamic_level]
        .iter()
        .flatten()
        .any(|v| *v < 0.0)
    {
        return Err(DbError::Invalid("Water level cannot be negative.".into()));
    }
    let id = new_id();
    conn.execute(
        "INSERT INTO water_readings (id, borewell_id, measured_on, static_level, dynamic_level, source, remarks)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, borewell_id, reading.measured_on, reading.static_level, reading.dynamic_level, reading.source, reading.remarks],
    )?;
    sync_current_level(conn, borewell_id)?;
    record_history(
        conn,
        "borewell",
        borewell_id,
        "update",
        &format!(
            "Added a water reading for {} ({})",
            b.borewell_id, reading.measured_on
        ),
        None,
        None,
    )?;
    Ok(WaterReading {
        id,
        borewell_id: borewell_id.into(),
        ..reading.clone()
    })
}

pub fn delete_water_reading(conn: &Connection, reading_id: &str) -> Result<()> {
    let borewell_id: String = conn
        .query_row(
            "SELECT borewell_id FROM water_readings WHERE id = ?1",
            [reading_id],
            |r| r.get(0),
        )
        .map_err(|_| DbError::NotFound("This water reading".into()))?;
    conn.execute("DELETE FROM water_readings WHERE id = ?1", [reading_id])?;
    sync_current_level(conn, &borewell_id)?;
    record_history(
        conn,
        "borewell",
        &borewell_id,
        "update",
        "Removed a water reading",
        None,
        None,
    )
}

fn sync_current_level(conn: &Connection, borewell_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE borewells SET
            water_level = COALESCE((SELECT static_level FROM water_readings WHERE borewell_id = ?1 AND static_level IS NOT NULL ORDER BY measured_on DESC LIMIT 1), water_level),
            dynamic_water_level = COALESCE((SELECT dynamic_level FROM water_readings WHERE borewell_id = ?1 AND dynamic_level IS NOT NULL ORDER BY measured_on DESC LIMIT 1), dynamic_water_level)
         WHERE id = ?1",
        [borewell_id],
    )?;
    Ok(())
}

fn touch(conn: &Connection, borewell_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE borewells SET updated_at = ?2 WHERE id = ?1",
        params![borewell_id, crate::db::now()],
    )?;
    Ok(())
}

fn check_interval(n: usize, what: &str, start: f64, end: f64) -> Result<()> {
    if !start.is_finite() || !end.is_finite() || start < 0.0 {
        return Err(DbError::Invalid(format!(
            "{what} {n} has a depth that is not a valid number."
        )));
    }
    if end <= start {
        return Err(DbError::Invalid(format!(
            "{what} {n} ends at {end}, which is not deeper than where it starts ({start})."
        )));
    }
    Ok(())
}
