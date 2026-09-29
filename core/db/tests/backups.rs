mod common;

use common::{input, open_temp};
use strata_db::backup::{self, BackupReason, KEEP_AUTOMATIC};
use strata_db::repo::borewells;
use strata_db::{schema, DbError};

#[test]
fn backup_is_a_verified_readable_snapshot() {
    let (_dir, db) = open_temp();
    db.with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();
    let info = db
        .with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .unwrap();
    assert_eq!(info.kind, "manual");
    assert_eq!(info.label, "Made by you");
    assert_eq!(info.borewell_count, Some(1));
    assert!(info.readable);
    assert_eq!(
        backup::verify(std::path::Path::new(&info.path)).unwrap(),
        schema::LATEST_VERSION
    );
}

#[test]
fn only_the_newest_automatic_backups_are_kept() {
    let (_dir, db) = open_temp();
    let manual = db
        .with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .unwrap();
    for _ in 0..(KEEP_AUTOMATIC + 3) {
        db.with(|c| backup::create(c, &db.backups_dir(), BackupReason::Automatic))
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5)); // distinct timestamps
    }
    let all = backup::list(&db.backups_dir()).unwrap();
    assert_eq!(
        all.iter().filter(|b| b.kind == "auto").count(),
        KEEP_AUTOMATIC
    );
    assert!(
        all.iter().any(|b| b.file_name == manual.file_name),
        "manual backups are never pruned"
    );
    assert!(
        all.windows(2).all(|w| w[0].file_name > w[1].file_name),
        "newest first"
    );
}

#[test]
fn restore_brings_back_old_data_and_saves_a_safety_copy_first() {
    let (_dir, db) = open_temp();
    let kept = db
        .with_tx(|tx| borewells::create(tx, &input("BW-KEEP")))
        .unwrap();
    let snapshot = db
        .with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .unwrap();

    db.with_tx(|tx| borewells::create(tx, &input("BW-LATER")))
        .unwrap();
    db.with_tx(|tx| borewells::soft_delete(tx, &kept.id))
        .unwrap();
    assert_eq!(db.with(borewells::count_active).unwrap(), 1);

    let safety = backup::restore(&db, std::path::Path::new(&snapshot.path)).unwrap();
    assert_eq!(safety.kind, "before-restore");
    assert_eq!(
        safety.borewell_count,
        Some(1),
        "safety copy holds the state just before restoring"
    );

    let active = db
        .with(|c| borewells::search(c, &Default::default()))
        .unwrap();
    assert_eq!(
        active
            .iter()
            .map(|i| i.borewell.borewell_id.as_str())
            .collect::<Vec<_>>(),
        ["BW-KEEP"]
    );
    // The restored database is still fully usable.
    db.with_tx(|tx| borewells::create(tx, &input("BW-AFTER")))
        .unwrap();
    let journal: String = db
        .with(|c| Ok(c.query_row("PRAGMA journal_mode", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(journal, "wal");
}

#[test]
fn restore_refuses_damaged_newer_and_old_app_files() {
    let (dir, db) = open_temp();
    db.with_tx(|tx| borewells::create(tx, &input("BW-1")))
        .unwrap();

    let junk = dir.path().join("junk.db");
    std::fs::write(&junk, b"this is not a database").unwrap();
    assert!(matches!(
        backup::restore(&db, &junk),
        Err(DbError::CorruptBackup(_))
    ));

    let newer = db
        .with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .unwrap();
    rusqlite::Connection::open(&newer.path)
        .unwrap()
        .execute_batch(&format!(
            "PRAGMA user_version = {}",
            schema::LATEST_VERSION + 1
        ))
        .unwrap();
    assert!(matches!(
        backup::restore(&db, std::path::Path::new(&newer.path)),
        Err(DbError::NewerSchema { .. })
    ));

    let old_app = common::build_legacy(dir.path(), common::LegacyGeneration::SnakeEarly);
    let err = backup::restore(&db, &old_app).unwrap_err();
    assert!(err.to_string().contains("older StrataField"), "{err}");

    assert_eq!(
        db.with(borewells::count_active).unwrap(),
        1,
        "refused restores change nothing"
    );
}
