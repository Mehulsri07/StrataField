mod common;

use common::{input, open_temp};
use rusqlite::Connection;
use strata_db::models::{Material, PipeSegment, SearchFilters, Section, StrataLayer, WaterReading};
use strata_db::repo::{
    self, attachments, borewells, layers, materials, misc, projects, ImportRequest,
    ImportedBorewell,
};
use strata_db::{schema, Database, DbError};

#[test]
fn new_database_is_created_at_the_latest_schema_with_default_materials() {
    let dir = tempfile::tempdir().unwrap();
    let (db, report) = Database::open(dir.path()).unwrap();
    assert!(report.created);
    assert_eq!(report.previous_version, 0);
    assert_eq!(report.schema_version, schema::LATEST_VERSION);
    let mats = db.with(materials::list).unwrap();
    assert_eq!(mats.len(), 16, "core/materials.json has 16 materials");
    for id in [
        "clay_kankar",
        "sandy_kankar",
        "rock",
        "boulder",
        "not_recorded",
    ] {
        assert!(mats.iter().any(|m| m.id == id), "missing {id}");
    }
    let journal: String = db
        .with(|c| Ok(c.query_row("PRAGMA journal_mode", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(journal, "wal");
}

#[test]
fn reopening_is_idempotent_and_keeps_data() {
    let dir = tempfile::tempdir().unwrap();
    {
        let (db, _) = Database::open(dir.path()).unwrap();
        db.with_tx(|tx| borewells::create(tx, &input("BW-1")))
            .unwrap();
    }
    let (db, report) = Database::open(dir.path()).unwrap();
    assert!(!report.created);
    assert_eq!(report.previous_version, schema::LATEST_VERSION);
    assert!(
        report.upgrade_backup.is_none(),
        "no backup when nothing is upgraded"
    );
    assert_eq!(db.with(borewells::count_active).unwrap(), 1);
    assert_eq!(
        db.with(materials::list).unwrap().len(),
        16,
        "seeding twice adds nothing"
    );
}

#[test]
fn a_database_from_a_newer_version_is_refused_and_left_untouched() {
    let dir = tempfile::tempdir().unwrap();
    drop(Database::open(dir.path()).unwrap());
    let path = dir.path().join("strata.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(&format!(
            "PRAGMA user_version = {}",
            schema::LATEST_VERSION + 1
        ))
        .unwrap();

    match Database::open(dir.path()) {
        Err(DbError::NewerSchema { found, supported }) => {
            assert_eq!(found, schema::LATEST_VERSION + 1);
            assert_eq!(supported, schema::LATEST_VERSION);
        }
        other => panic!("expected NewerSchema, got {:?}", other.map(|_| ())),
    }
    let v: i64 = Connection::open(&path)
        .unwrap()
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(v, schema::LATEST_VERSION + 1);
}

#[test]
fn another_connection_writing_changes_data_version() {
    let (dir, db) = open_temp();
    let before = db.data_version().unwrap();
    // A second app writing to the same file.
    let other = Connection::open(dir.path().join("strata.db")).unwrap();
    other
        .execute("INSERT INTO settings (key, value) VALUES ('x', '1')", [])
        .unwrap();
    assert_ne!(db.data_version().unwrap(), before);
}

#[test]
fn borewell_lifecycle_create_edit_recycle_restore_purge_with_history() {
    let (_dir, db) = open_temp();
    let b = db
        .with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    assert_eq!(b.project, "Zone 1 · Old City");
    assert_eq!(
        b.location_source, "typed",
        "coordinates without a source are recorded as typed"
    );
    assert_eq!(b.import_method, "manual");

    let mut edit = input("BW-1");
    edit.owner_name = "New Owner".into();
    edit.project = "zone 1 · old city".into(); // same project, different case
    let edited = db
        .with_tx(|tx| borewells::update(tx, &b.id, &edit))
        .unwrap();
    assert_eq!(edited.owner_name, "New Owner");
    assert_eq!(
        edited.project_id, b.project_id,
        "project names match case-insensitively"
    );
    assert_eq!(db.with(projects::list).unwrap().len(), 1);

    db.with_tx(|tx| borewells::soft_delete(tx, &b.id)).unwrap();
    assert_eq!(
        db.with(|c| borewells::search(c, &SearchFilters::default()))
            .unwrap()
            .len(),
        0
    );
    let bin = SearchFilters {
        show_deleted: true,
        ..Default::default()
    };
    assert_eq!(db.with(|c| borewells::search(c, &bin)).unwrap().len(), 1);

    db.with_tx(|tx| borewells::restore(tx, &b.id)).unwrap();
    let err = db
        .with_tx(|tx| borewells::delete_permanently(tx, &b.id))
        .unwrap_err();
    assert!(
        err.to_string().contains("Recycle bin"),
        "active records cannot be purged: {err}"
    );

    db.with_tx(|tx| borewells::soft_delete(tx, &b.id)).unwrap();
    db.with_tx(|tx| borewells::delete_permanently(tx, &b.id))
        .unwrap();
    assert!(matches!(
        db.with(|c| borewells::get(c, &b.id)),
        Err(DbError::NotFound(_))
    ));

    let actions: Vec<String> = db
        .with(|c| misc::history_for(c, "borewell", &b.id))
        .unwrap()
        .into_iter()
        .map(|h| h.action)
        .collect();
    assert_eq!(
        actions,
        ["purge", "delete", "restore", "delete", "update", "create"]
    );
}

#[test]
fn invalid_borewell_input_is_refused_with_a_plain_message() {
    let (_dir, db) = open_temp();
    let mut bad = input("");
    assert!(db
        .with_tx(|tx| borewells::create(tx, &bad))
        .unwrap_err()
        .to_string()
        .contains("borewell ID"));
    bad = input("BW-9");
    bad.longitude = None;
    assert!(db
        .with_tx(|tx| borewells::create(tx, &bad))
        .unwrap_err()
        .to_string()
        .contains("both latitude and longitude"));
    bad = input("BW-9");
    bad.total_depth = Some(-5.0);
    assert!(db
        .with_tx(|tx| borewells::create(tx, &bad))
        .unwrap_err()
        .to_string()
        .contains("cannot be negative"));
}

#[test]
fn search_filters_combine() {
    let (_dir, db) = open_temp();
    let mut a = input("BW-A");
    a.area = "Chinhat".into();
    a.water_level = Some(46.0);
    a.total_depth = Some(200.0);
    let mut b = input("BW-B");
    b.latitude = None;
    b.longitude = None;
    let (a, _b) = db
        .with_tx(|tx| Ok((borewells::create(tx, &a)?, borewells::create(tx, &b)?)))
        .unwrap();
    db.with_tx(|tx| layers::replace_strata(tx, &a.id, &[layer(0.0, 30.0, "kankar")]))
        .unwrap();

    let find = |f: SearchFilters| {
        db.with(|c| borewells::search(c, &f))
            .unwrap()
            .into_iter()
            .map(|i| i.borewell.borewell_id)
            .collect::<Vec<_>>()
    };
    assert_eq!(
        find(SearchFilters {
            query: "chinhat".into(),
            ..Default::default()
        }),
        ["BW-A"]
    );
    assert_eq!(
        find(SearchFilters {
            query: "BW-B".into(),
            field: "borewellId".into(),
            ..Default::default()
        }),
        ["BW-B"]
    );
    assert_eq!(
        find(SearchFilters {
            max_water_level: Some(60.0),
            ..Default::default()
        }),
        ["BW-A"]
    );
    assert_eq!(
        find(SearchFilters {
            min_depth: Some(250.0),
            ..Default::default()
        }),
        ["BW-B"]
    );
    assert_eq!(
        find(SearchFilters {
            no_location: true,
            ..Default::default()
        }),
        ["BW-B"]
    );
    assert_eq!(
        find(SearchFilters {
            material_id: Some("kankar".into()),
            ..Default::default()
        }),
        ["BW-A"]
    );
    assert_eq!(
        find(SearchFilters {
            query: "100%".into(),
            ..Default::default()
        })
        .len(),
        0,
        "% is matched literally"
    );
    let items = db
        .with(|c| {
            borewells::search(
                c,
                &SearchFilters {
                    query: "BW-A".into(),
                    ..Default::default()
                },
            )
        })
        .unwrap();
    assert_eq!(
        items[0].strata.len(),
        1,
        "list rows carry their layers for the strip"
    );
}

fn layer(start: f64, end: f64, material_id: &str) -> StrataLayer {
    StrataLayer {
        start_depth: start,
        end_depth: end,
        material_id: Some(material_id.into()),
        ..Default::default()
    }
}

#[test]
fn saving_layers_fills_details_from_the_material_library_and_allows_not_recorded_gaps() {
    let (_dir, db) = open_temp();
    let b = db
        .with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    let saved = db
        .with_tx(|tx| {
            layers::replace_strata(
                tx,
                &b.id,
                &[
                    layer(0.0, 40.0, "clay_kankar"),
                    layer(40.0, 60.0, "not_recorded"),
                    layer(60.0, 90.0, "coarse_sand"),
                ],
            )
        })
        .unwrap();
    assert_eq!(saved[0].material, "Clay Kankar");
    assert_eq!(saved[1].material, "Not recorded");
    assert_eq!(saved[1].pattern, "unrecorded");
    assert!(!saved[2].color.is_empty());

    // Saving again replaces rather than appends.
    let saved = db
        .with_tx(|tx| layers::replace_strata(tx, &b.id, &[layer(0.0, 90.0, "clay")]))
        .unwrap();
    assert_eq!(saved.len(), 1);

    let err = db
        .with_tx(|tx| layers::replace_strata(tx, &b.id, &[layer(50.0, 40.0, "clay")]))
        .unwrap_err();
    assert!(err.to_string().contains("not deeper"), "{err}");
    assert_eq!(
        db.with(|c| layers::strata_for(c, &b.id)).unwrap().len(),
        1,
        "a rejected save changes nothing"
    );
}

#[test]
fn pipes_and_water_readings() {
    let (_dir, db) = open_temp();
    let b = db
        .with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    let pipe = |s: f64, e: f64, t: &str| PipeSegment {
        start_depth: s,
        end_depth: e,
        pipe_type: t.into(),
        ..Default::default()
    };
    let saved = db
        .with_tx(|tx| {
            layers::replace_pipes(
                tx,
                &b.id,
                &[pipe(0.0, 100.0, "plain"), pipe(100.0, 140.0, "slotted")],
            )
        })
        .unwrap();
    assert_eq!(saved.len(), 2);
    assert!(db
        .with_tx(|tx| layers::replace_pipes(tx, &b.id, &[pipe(0.0, 10.0, "copper")]))
        .is_err());

    let reading = |d: &str, s: f64| WaterReading {
        measured_on: d.into(),
        static_level: Some(s),
        ..Default::default()
    };
    db.with_tx(|tx| layers::add_water_reading(tx, &b.id, &reading("2026-03-01", 104.0)))
        .unwrap();
    let newest = db
        .with_tx(|tx| layers::add_water_reading(tx, &b.id, &reading("2026-06-01", 118.0)))
        .unwrap();
    db.with_tx(|tx| layers::add_water_reading(tx, &b.id, &reading("2025-11-01", 99.0)))
        .unwrap();
    assert_eq!(
        db.with(|c| borewells::get(c, &b.id)).unwrap().water_level,
        Some(118.0),
        "current level follows the newest reading"
    );

    db.with_tx(|tx| layers::delete_water_reading(tx, &newest.id))
        .unwrap();
    assert_eq!(
        db.with(|c| borewells::get(c, &b.id)).unwrap().water_level,
        Some(104.0)
    );
    assert_eq!(db.with(|c| layers::water_for(c, &b.id)).unwrap().len(), 2);
}

#[test]
fn custom_materials_can_be_added_but_built_in_and_used_ones_cannot_be_deleted() {
    let (_dir, db) = open_temp();
    let murrum = db
        .with_tx(|tx| {
            materials::create(
                tx,
                &Material {
                    id: String::new(),
                    name: "Murrum".into(),
                    color: "#B5651D".into(),
                    pattern: "dots".into(),
                    is_custom: true,
                    lithology_class: None,
                    lithology_family: Some("OTHER".into()),
                },
            )
        })
        .unwrap();
    assert!(murrum.id.starts_with("custom_"));
    assert!(db
        .with_tx(|tx| materials::create(
            tx,
            &Material {
                id: String::new(),
                ..murrum.clone()
            }
        ))
        .unwrap_err()
        .to_string()
        .contains("already exists"));
    assert!(db
        .with_tx(|tx| materials::delete(tx, "clay"))
        .unwrap_err()
        .to_string()
        .contains("Built-in"));

    let b = db
        .with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    db.with_tx(|tx| layers::replace_strata(tx, &b.id, &[layer(0.0, 10.0, &murrum.id)]))
        .unwrap();
    assert!(db
        .with_tx(|tx| materials::delete(tx, &murrum.id))
        .unwrap_err()
        .to_string()
        .contains("used by 1"));

    // Renaming updates layers that use it.
    db.with_tx(|tx| {
        materials::update(
            tx,
            &Material {
                name: "Moorum".into(),
                ..murrum.clone()
            },
        )
    })
    .unwrap();
    assert_eq!(
        db.with(|c| layers::strata_for(c, &b.id)).unwrap()[0].material,
        "Moorum"
    );
}

#[test]
fn photos_and_files_are_copied_into_the_data_folder_and_removed_with_their_record() {
    let (dir, db) = open_temp();
    let src_dir = tempfile::tempdir().unwrap();
    let photo_src = src_dir.path().join("IMG_1042.JPG");
    std::fs::write(&photo_src, b"jpeg bytes").unwrap();
    let pdf_src = src_dir.path().join("report.pdf");
    std::fs::write(&pdf_src, b"%PDF").unwrap();

    let b = db
        .with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    let photo = db
        .with_tx(|tx| {
            attachments::add_photo(
                tx,
                dir.path(),
                &b.id,
                attachments::NewPhoto {
                    source: &photo_src,
                    capture_date: None,
                    latitude: None,
                    longitude: None,
                    caption: "Rig".into(),
                },
            )
        })
        .unwrap();
    let file = db
        .with_tx(|tx| attachments::add_file(tx, dir.path(), &b.id, &pdf_src))
        .unwrap();
    assert!(
        photo.file_path.starts_with(dir.path().to_str().unwrap()),
        "stored inside the data folder"
    );
    assert!(photo.file_path.ends_with(".jpg"));
    assert_eq!(file.kind, "pdf");
    assert_eq!(file.original_name, "report.pdf");
    assert!(std::path::Path::new(&photo.file_path).exists());

    db.with_tx(|tx| attachments::remove(tx, dir.path(), "photos", &photo.id))
        .unwrap();
    assert!(
        !std::path::Path::new(&photo.file_path).exists(),
        "managed file removed"
    );
    assert!(photo_src.exists(), "the user's original is never touched");

    let record = db.with(|c| repo::record(c, dir.path(), &b.id)).unwrap();
    assert_eq!((record.photos.len(), record.files.len()), (0, 1));
}

#[test]
fn an_excel_import_is_saved_as_one_batch_or_not_at_all() {
    let (dir, db) = open_temp();
    let good = ImportedBorewell {
        borewell: input("BW-X1"),
        strata: vec![layer(0.0, 20.0, "clay")],
        pipes: vec![],
    };
    let mut bad_input = input("");
    bad_input.owner_name = "No ID".into();
    let bad = ImportedBorewell {
        borewell: bad_input,
        ..Default::default()
    };

    let req = ImportRequest {
        file_name: "logs.xlsx".into(),
        borewells: vec![good.clone(), bad],
        ..Default::default()
    };
    let err = db
        .with_tx(|tx| repo::import_batch(tx, dir.path(), &req))
        .unwrap_err();
    assert!(err.to_string().contains("Borewell 2 in the file"), "{err}");
    assert_eq!(
        db.with(borewells::count_active).unwrap(),
        0,
        "nothing saved when one borewell fails"
    );

    let req = ImportRequest {
        file_name: "logs.xlsx".into(),
        unrecognised_names: vec!["murrum".into()],
        borewells: vec![good],
        ..Default::default()
    };
    let result = db
        .with_tx(|tx| repo::import_batch(tx, dir.path(), &req))
        .unwrap();
    let b = db
        .with(|c| borewells::get(c, &result.borewell_ids[0]))
        .unwrap();
    assert_eq!(b.import_method, "excel");
    assert_eq!(b.import_batch_id.as_deref(), Some(result.batch_id.as_str()));
    assert_eq!(db.with(|c| layers::strata_for(c, &b.id)).unwrap().len(), 1);
}

#[test]
fn sections_and_geocode_cache_round_trip() {
    let (_dir, db) = open_temp();
    let s = db
        .with(|c| {
            misc::save_section(
                c,
                &Section {
                    id: String::new(),
                    name: "A–A′ North to south".into(),
                    line: vec![[26.936, 80.922], [26.769, 80.947]],
                    corridor_half_km: 2.0,
                    settings: serde_json::json!({ "showWater": true }),
                    created_at: String::new(),
                    updated_at: String::new(),
                },
            )
        })
        .unwrap();
    let listed = db.with(misc::list_sections).unwrap();
    assert_eq!(listed, vec![s.clone()]);
    assert!(db
        .with(|c| misc::save_section(
            c,
            &Section {
                line: vec![[1.0, 2.0]],
                ..s.clone()
            }
        ))
        .is_err());

    let hit = misc::GeocodeHit {
        latitude: 26.85,
        longitude: 80.94,
        display_name: "Hazratganj, Lucknow".into(),
    };
    db.with(|c| misc::cache_geocode(c, "  Hazratganj   LUCKNOW ", &hit))
        .unwrap();
    assert_eq!(
        db.with(|c| misc::cached_geocode(c, "hazratganj lucknow"))
            .unwrap(),
        Some(hit)
    );
}
