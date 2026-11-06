fn main() {
    // The window runs the remote web app, and a remote origin may only call app commands an app manifest lists.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["set_badge", "notify", "set_voice"])),
    )
    .expect("failed to run tauri-build");
}
