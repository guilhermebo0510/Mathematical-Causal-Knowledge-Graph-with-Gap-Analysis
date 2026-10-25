fn main() {
    // Icon changes must invalidate embedded window/EXE resources in dev as well.
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "engine_request",
            "cancel_engine_request",
            "open_project_file",
            "save_project_file",
            "forget_project_file",
            "adopt_open_project",
            "recovery_storage",
            "history_read",
            "archive_run",
            "proposal_journal",
            "proposal_session",
        ]),
    ))
    .expect("Failed to build desktop configuration");
}
