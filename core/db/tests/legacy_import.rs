mod common;

use common::{build_legacy, file_digest, open_temp, LegacyGeneration};
use strata_db::legacy;
use strata_db::models::SearchFilters;
use strata_db::repo::{self, borewells, layers, materials, projects};

fn check_generation(generation: LegacyGeneration) {
    let (dir, db) = open_temp();
    let legacy_dir = tempfile::tempdir().unwrap();
    let old = build_legacy(legacy_dir.path(), generation);
    let before = file_digest(&old);

    let report = legacy::import(&db, &old).unwrap();
    assert_eq!(
        file_digest(&old),
        before,
        "the old database is never modified"
    );
    assert_eq!(report.borewells, 2);
    assert_eq!(report.pipe_segments, 2);
    assert!(db.with(legacy::already_imported).unwrap());

    let b1 = db.with(|c| repo::record(c, dir.path(), "b1")).unwrap();
    assert_eq!(b1.borewell.borewell_id, "BW-001");
    assert_eq!(b1.borewell.owner_name, "Asha");
    assert_eq!(b1.borewell.water_level, Some(116.0));
    assert_eq!(b1.borewell.location_source, "unknown");
    assert_eq!(
        b1.water_readings.len(),
        1,
        "the old water level becomes the first dated reading"
    );
    assert_eq!(
        b1.strata[0].material_id.as_deref(),
        Some("clay"),
        "known names link to the material library"
    );
    assert_eq!(b1.pipes[1].pipe_type, "slotted");
    assert_eq!(b1.history[0].action, "import");

    let b2 = db.with(|c| borewells::get(c, "b2")).unwrap();
    assert_eq!(b2.water_level, Some(102.0));
    assert_eq!(b2.latitude, None);

    match generation {
        LegacyGeneration::CamelCase => {
            assert_eq!(b1.borewell.project, "Default Project");
            assert_eq!(report.unmatched_material_names, ["Murrum"]);
        }
        LegacyGeneration::SnakeEarly | LegacyGeneration::SnakeLatest => {
            assert_eq!(report.in_recycle_bin, 1);
            assert!(b2.deleted_at.is_some(), "recycle bin state is kept");
            assert_eq!(b2.import_method, "excel");
            let names: Vec<String> = db
                .with(projects::list)
                .unwrap()
                .into_iter()
                .map(|p| p.name)
                .collect();
            assert_eq!(names, ["Default Project", "Zone 5"]);
            assert_eq!(
                (report.photos, report.files),
                (1, 2),
                "one old files row held an Excel and a PDF path"
            );
            assert_eq!(
                report.custom_materials_added, 1,
                "the user's own Pebble Bed type is kept"
            );
            assert!(db
                .with(materials::list)
                .unwrap()
                .iter()
                .any(|m| m.name == "Pebble Bed" && m.is_custom));
            assert_eq!(
                report.unmatched_material_names,
                ["Murrum"],
                "Pebble Bed now matches its imported custom type"
            );
            assert_eq!(
                report.orphaned_pipes, 1,
                "a pipe left behind by a deleted borewell is reported"
            );
        }
    }
    if let LegacyGeneration::SnakeLatest = generation {
        assert_eq!(b1.borewell.drilling_method.as_deref(), Some("DTH"));
        assert_eq!(b1.pipes[1].pipe_subtype.as_deref(), Some("RIBBED_SCREEN"));
    }

    // Importing again adds nothing.
    let again = legacy::import(&db, &old).unwrap();
    assert_eq!((again.borewells, again.already_present), (0, 2));
    assert!(
        again.safety_backup.is_some(),
        "a backup is taken before importing into a database that has data"
    );
}

#[test]
fn imports_the_earliest_camel_case_schema() {
    check_generation(LegacyGeneration::CamelCase);
}

#[test]
fn imports_the_snake_case_schema_without_material_links() {
    check_generation(LegacyGeneration::SnakeEarly);
}

#[test]
fn imports_the_latest_electron_schema() {
    check_generation(LegacyGeneration::SnakeLatest);
}

#[test]
fn finds_the_old_database_through_its_settings_file() {
    let appdata = tempfile::tempdir().unwrap();
    let app_dir = appdata.path().join("StrataField");
    std::fs::create_dir_all(&app_dir).unwrap();
    assert_eq!(legacy::find_legacy_database(appdata.path()), None);

    let elsewhere = tempfile::tempdir().unwrap();
    let custom = build_legacy(elsewhere.path(), LegacyGeneration::SnakeEarly);
    std::fs::write(
        app_dir.join("settings.json"),
        serde_json::json!({ "databasePath": custom }).to_string(),
    )
    .unwrap();
    assert_eq!(legacy::find_legacy_database(appdata.path()), Some(custom));
}

/// Runs against a copy of the owner's real Electron database when it is present locally
/// (private-fixtures/ is git-ignored, so CI skips this).
#[test]
fn imports_the_real_legacy_database_copy_when_available() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../private-fixtures/legacy-stratafield.db");
    if !fixture.exists() {
        eprintln!("skipped: {} not present", fixture.display());
        return;
    }
    // Work on a throwaway copy so even a read-only open cannot touch the fixture's WAL state.
    let scratch = tempfile::tempdir().unwrap();
    let copy = scratch.path().join("stratafield.db");
    std::fs::copy(&fixture, &copy).unwrap();
    let before = file_digest(&fixture);

    let (dir, db) = open_temp();
    let report = legacy::import(&db, &copy).unwrap();
    println!("real legacy import: {report:#?}");
    assert_eq!(file_digest(&fixture), before);
    // The file holds 44 layers and 41 pipe pieces, but 4 layers and 3 pipes belong to a borewell
    // the old app had already deleted. Those are reported, and everything else is imported.
    assert_eq!(report.borewells, 1);
    assert_eq!(
        report.custom_materials_added, 0,
        "old names like \"medium sand\" link to today's materials"
    );
    assert!(report.unmatched_material_names.is_empty());
    assert_eq!((report.strata_layers, report.orphaned_layers), (40, 4));
    assert_eq!((report.pipe_segments, report.orphaned_pipes), (38, 3));

    let items = db
        .with(|c| {
            borewells::search(
                c,
                &SearchFilters {
                    show_deleted: report.in_recycle_bin > 0,
                    ..Default::default()
                },
            )
        })
        .unwrap();
    let id = &items[0].borewell.id;
    let record = db.with(|c| repo::record(c, dir.path(), id)).unwrap();
    assert_eq!(record.strata.len(), 40);
    assert_eq!(record.pipes.len(), 38);
    assert_eq!(db.with(|c| layers::strata_for(c, id)).unwrap().len(), 40);
}
