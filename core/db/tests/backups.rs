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

#[test]
fn every_backup_is_also_copied_to_the_second_folder_and_the_newest_are_kept() {
    let (dir, db) = open_temp();
    let usb = tempfile::tempdir().unwrap();
    assert_eq!(backup::second_copy(dir.path()).folder, None);
    backup::set_second_copy_folder(dir.path(), Some(usb.path())).unwrap();

    for _ in 0..(backup::KEEP_SECOND_COPIES + 2) {
        db.with(|c| backup::create(c, &db.backups_dir(), BackupReason::Automatic))
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    let copies: Vec<_> = std::fs::read_dir(usb.path().join(backup::SECOND_COPY_SUBFOLDER))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(copies.len(), backup::KEEP_SECOND_COPIES, "{copies:?}");
    assert!(
        copies.iter().all(|n| n.ends_with(".db")),
        "no half-written copies left"
    );
    let newest = backup::list(&db.backups_dir()).unwrap()[0]
        .file_name
        .clone();
    assert!(
        copies.contains(&newest),
        "the newest backup is in the second folder"
    );

    let status = backup::second_copy(dir.path());
    assert!(status.last_copied_at.is_some());
    assert_eq!(status.last_error, None);
    // The copies are real, checkable backups.
    let copy = usb.path().join(backup::SECOND_COPY_SUBFOLDER).join(&newest);
    assert_eq!(backup::verify(&copy).unwrap(), schema::LATEST_VERSION);
}

#[test]
fn an_unplugged_second_folder_is_reported_but_the_backup_still_works() {
    let (dir, db) = open_temp();
    let usb = tempfile::tempdir().unwrap();
    backup::set_second_copy_folder(dir.path(), Some(usb.path())).unwrap();
    let gone = usb.path().to_path_buf();
    drop(usb); // the USB drive is unplugged

    let info = db
        .with(|c| backup::create(c, &db.backups_dir(), BackupReason::Manual))
        .unwrap();
    assert!(
        std::path::Path::new(&info.path).is_file(),
        "the backup itself is made"
    );
    let status = backup::second_copy(dir.path());
    assert_eq!(
        status.folder.as_deref(),
        Some(gone.to_string_lossy().as_ref())
    );
    assert!(
        status
            .last_error
            .as_deref()
            .is_some_and(|e| e.contains("not available")),
        "{status:?}"
    );

    // Choosing a folder inside the data folder is refused; stopping copies clears the setting.
    let err = backup::set_second_copy_folder(dir.path(), Some(&db.backups_dir())).unwrap_err();
    assert!(err.to_string().contains("outside"), "{err}");
    assert_eq!(
        backup::set_second_copy_folder(dir.path(), None)
            .unwrap()
            .folder,
        None
    );
}
