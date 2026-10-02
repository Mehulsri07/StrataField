use crate::db::{new_id, now, record_history};
use crate::error::{DbError, Result};
use crate::models::{Borewell, BorewellInput, BorewellListItem, SearchFilters};
use crate::repo::{layers, projects};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension, Row};

const COLUMNS: &str = "b.id, b.project_id, COALESCE(p.name, ''), b.borewell_id, b.owner_name, b.house_no, b.area, b.city,
    b.address, b.latitude, b.longitude, b.location_source, b.location_accuracy_m, b.ground_elevation_m,
    b.elevation_source, b.bore_dia, b.pipe_dia, b.total_depth, b.water_level, b.dynamic_water_level,
    b.depth_unit, b.drilling_method, b.record_quality, b.remarks, b.date, b.created_at, b.updated_at,
    b.import_batch_id, b.import_source, b.import_method, b.deleted_at,
    CASE WHEN b.water_level IS NULL THEN NULL ELSE COALESCE(
        (SELECT MAX(w.measured_on) FROM water_readings w WHERE w.borewell_id = b.id AND w.static_level IS NOT NULL),
        NULLIF(b.date, '')) END";

const FROM: &str = "FROM borewells b LEFT JOIN projects p ON p.id = b.project_id";

fn map_row(r: &Row) -> rusqlite::Result<Borewell> {
    Ok(Borewell {
        id: r.get(0)?,
        project_id: r.get(1)?,
        project: r.get(2)?,
        borewell_id: r.get(3)?,
        owner_name: r.get(4)?,
        house_no: r.get(5)?,
        area: r.get(6)?,
        city: r.get(7)?,
        address: r.get(8)?,
        latitude: r.get(9)?,
        longitude: r.get(10)?,
        location_source: r.get(11)?,
        location_accuracy_m: r.get(12)?,
        ground_elevation_m: r.get(13)?,
        elevation_source: r.get(14)?,
        bore_dia: r.get(15)?,
        pipe_dia: r.get(16)?,
        total_depth: r.get(17)?,
        water_level: r.get(18)?,
        dynamic_water_level: r.get(19)?,
        depth_unit: r.get(20)?,
        drilling_method: r.get(21)?,
        record_quality: r.get(22)?,
        remarks: r.get(23)?,
        date: r.get(24)?,
        created_at: r.get(25)?,
        updated_at: r.get(26)?,
        import_batch_id: r.get(27)?,
        import_source: r.get(28)?,
        import_method: r.get(29)?,
        deleted_at: r.get(30)?,
        water_level_on: r.get(31)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Borewell> {
    conn.query_row(
        &format!("SELECT {COLUMNS} {FROM} WHERE b.id = ?1"),
        [id],
        map_row,
    )
    .optional()?
    .ok_or_else(|| DbError::NotFound("This borewell".into()))
}

/// Borewells matching `f`, newest drilling date first, each with its layers for the list strip.
pub fn search(conn: &Connection, f: &SearchFilters) -> Result<Vec<BorewellListItem>> {
    let mut clauses: Vec<String> = vec![if f.show_deleted {
        "b.deleted_at IS NOT NULL"
    } else {
        "b.deleted_at IS NULL"
    }
    .into()];
    let mut args: Vec<Value> = Vec::new();
    let mut push = |clause: &str, value: Value, clauses: &mut Vec<String>| {
        args.push(value);
        clauses.push(clause.replace('?', &format!("?{}", args.len())));
    };

    let q = f.query.trim();
    if !q.is_empty() {
        let like = Value::Text(format!(
            "%{}%",
            q.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        ));
        push(
            "(b.borewell_id || ' ' || b.owner_name || ' ' || b.area || ' ' || b.city || ' ' || b.address || ' ' || COALESCE(p.name, '')) LIKE ? ESCAPE '\\'",
            like,
            &mut clauses,
        );
    }
    if let Some(v) = &f.date_from {
        push("b.date >= ?", Value::Text(v.clone()), &mut clauses);
    }
    if let Some(v) = &f.date_to {
        push("b.date <= ?", Value::Text(v.clone()), &mut clauses);
    }
    if let Some(v) = &f.project {
        push(
            "p.name = ? COLLATE NOCASE",
            Value::Text(v.clone()),
            &mut clauses,
        );
    }
    if let Some(v) = &f.material_id {
        push("EXISTS (SELECT 1 FROM strata_layers s WHERE s.borewell_id = b.id AND s.material_id = ?)", Value::Text(v.clone()), &mut clauses);
    }
    if let Some(v) = f.min_depth {
        push("b.total_depth >= ?", Value::Real(v), &mut clauses);
    }
    if let Some(v) = f.max_depth {
        push("b.total_depth <= ?", Value::Real(v), &mut clauses);
    }
    if let Some(v) = f.min_water_level {
        push("b.water_level >= ?", Value::Real(v), &mut clauses);
    }
    if let Some(v) = f.max_water_level {
        push("b.water_level <= ?", Value::Real(v), &mut clauses);
    }
    if f.no_location {
        clauses.push("(b.latitude IS NULL OR b.longitude IS NULL)".into());
    }

    let sql = format!(
        "SELECT {COLUMNS} {FROM} WHERE {} ORDER BY b.date DESC, b.created_at DESC",
        clauses.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let borewells = stmt
        .query_map(params_from_iter(args), map_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    borewells
        .into_iter()
        .map(|b| {
            Ok(BorewellListItem {
                strata: layers::strata_for(conn, &b.id)?,
                borewell: b,
            })
        })
        .collect()
}

pub fn create(conn: &Connection, input: &BorewellInput) -> Result<Borewell> {
    validate(input)?;
    let id = new_id();
    let project_id = projects::id_for_name(conn, &input.project)?;
    let ts = now();
    conn.execute(
        "INSERT INTO borewells (id, project_id, borewell_id, owner_name, house_no, area, city, address, latitude, longitude,
            location_source, location_accuracy_m, ground_elevation_m, elevation_source, bore_dia, pipe_dia, total_depth,
            water_level, dynamic_water_level, depth_unit, drilling_method, record_quality, remarks, date, created_at,
            updated_at, import_batch_id, import_source, import_method)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?25, ?26, ?27, ?28)",
        params![
            id, project_id, input.borewell_id.trim(), input.owner_name.trim(), input.house_no, input.area, input.city,
            input.address, input.latitude, input.longitude, location_source(input), input.location_accuracy_m,
            input.ground_elevation_m, input.elevation_source, input.bore_dia, input.pipe_dia, input.total_depth,
            input.water_level, input.dynamic_water_level, input.depth_unit.as_deref().unwrap_or("ft"),
            input.drilling_method, input.record_quality.as_deref().unwrap_or("unknown"), input.remarks, input.date, ts,
            input.import_batch_id, input.import_source, input.import_method.as_deref().unwrap_or("manual"),
        ],
    )?;
    let created = get(conn, &id)?;
    let action = if input.import_batch_id.is_some() {
        "import"
    } else {
        "create"
    };
    record_history(
        conn,
        "borewell",
        &id,
        action,
        &format!("Added {}", label(&created)),
        None,
        Some(&serde_json::to_value(&created)?),
    )?;
    Ok(created)
}

pub fn update(conn: &Connection, id: &str, input: &BorewellInput) -> Result<Borewell> {
    validate(input)?;
    let before = get(conn, id)?;
    let project_id = projects::id_for_name(conn, &input.project)?;
    conn.execute(
        "UPDATE borewells SET project_id = ?2, borewell_id = ?3, owner_name = ?4, house_no = ?5, area = ?6, city = ?7,
            address = ?8, latitude = ?9, longitude = ?10, location_source = ?11, location_accuracy_m = ?12,
            ground_elevation_m = ?13, elevation_source = ?14, bore_dia = ?15, pipe_dia = ?16, total_depth = ?17,
            water_level = ?18, dynamic_water_level = ?19, depth_unit = ?20, drilling_method = ?21, record_quality = ?22,
            remarks = ?23, date = ?24, updated_at = ?25
         WHERE id = ?1",
        params![
            id, project_id, input.borewell_id.trim(), input.owner_name.trim(), input.house_no, input.area, input.city,
            input.address, input.latitude, input.longitude, location_source(input), input.location_accuracy_m,
            input.ground_elevation_m, input.elevation_source, input.bore_dia, input.pipe_dia, input.total_depth,
            input.water_level, input.dynamic_water_level, input.depth_unit.as_deref().unwrap_or(&before.depth_unit),
            input.drilling_method, input.record_quality.as_deref().unwrap_or(&before.record_quality), input.remarks,
            input.date, now(),
        ],
    )?;
    let after = get(conn, id)?;
    record_history(
        conn,
        "borewell",
        id,
        "update",
        &format!("Edited {}", label(&after)),
        Some(&serde_json::to_value(&before)?),
        Some(&serde_json::to_value(&after)?),
    )?;
    Ok(after)
}

/// Moves a borewell to the Recycle bin.
pub fn soft_delete(conn: &Connection, id: &str) -> Result<()> {
    let b = get(conn, id)?;
    conn.execute(
        "UPDATE borewells SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    )?;
    record_history(
        conn,
        "borewell",
        id,
        "delete",
        &format!("Moved {} to the Recycle bin", label(&b)),
        None,
        None,
    )
}

pub fn restore(conn: &Connection, id: &str) -> Result<()> {
    let b = get(conn, id)?;
    conn.execute(
        "UPDATE borewells SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1",
        params![id, now()],
    )?;
    record_history(
        conn,
        "borewell",
        id,
        "restore",
        &format!("Restored {} from the Recycle bin", label(&b)),
        None,
        None,
    )
}

/// Deletes a borewell that is already in the Recycle bin, with its layers, pipes and readings.
/// Returns the stored paths of its photos and files so the caller can remove them from disk.
pub fn delete_permanently(conn: &Connection, id: &str) -> Result<Vec<String>> {
    let b = get(conn, id)?;
    if b.deleted_at.is_none() {
        return Err(DbError::Invalid(
            "Move this borewell to the Recycle bin before deleting it permanently.".into(),
        ));
    }
    let mut paths: Vec<String> = Vec::new();
    for table in ["photos", "files"] {
        let mut stmt = conn.prepare(&format!(
            "SELECT file_path FROM {table} WHERE borewell_id = ?1"
        ))?;
        paths.extend(
            stmt.query_map([id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?,
        );
    }
    let snapshot = serde_json::to_value(&b)?;
    conn.execute("DELETE FROM borewells WHERE id = ?1", [id])?;
    record_history(
        conn,
        "borewell",
        id,
        "purge",
        &format!("Permanently deleted {}", label(&b)),
        Some(&snapshot),
        None,
    )?;
    Ok(paths)
}

pub fn count_active(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM borewells WHERE deleted_at IS NULL",
        [],
        |r| r.get(0),
    )?)
}

fn label(b: &Borewell) -> String {
    if b.owner_name.is_empty() {
        b.borewell_id.clone()
    } else {
        format!("{} ({})", b.borewell_id, b.owner_name)
    }
}

fn location_source(input: &BorewellInput) -> &str {
    match (
        &input.location_source,
        input.latitude.is_some() && input.longitude.is_some(),
    ) {
        (Some(s), _) => s,
        (None, true) => "typed",
        (None, false) => "unknown",
    }
}

fn validate(input: &BorewellInput) -> Result<()> {
    if input.borewell_id.trim().is_empty() {
        return Err(DbError::Invalid("Enter a borewell ID.".into()));
    }
    match (input.latitude, input.longitude) {
        (Some(lat), Some(lon))
            if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) =>
        {
            return Err(DbError::Invalid(
                "The location is outside the valid range. Check the latitude and longitude.".into(),
            ))
        }
        (Some(_), None) | (None, Some(_)) => {
            return Err(DbError::Invalid(
                "Enter both latitude and longitude, or neither.".into(),
            ))
        }
        _ => {}
    }
    for (name, v) in [
        ("Total depth", input.total_depth),
        ("Water level", input.water_level),
        ("Hole size", input.bore_dia),
        ("Pipe size", input.pipe_dia),
    ] {
        if matches!(v, Some(x) if x < 0.0 || !x.is_finite()) {
            return Err(DbError::Invalid(format!("{name} cannot be negative.")));
        }
    }
    Ok(())
}
