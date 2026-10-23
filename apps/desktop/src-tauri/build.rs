fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["engine_request"])),
    )
    .expect("Failed to build desktop configuration");
}
