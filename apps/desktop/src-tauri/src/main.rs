#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::State;

// Only one cold-start engine request at a time, keeping resource use predictable.
struct EngineGate(tokio::sync::Mutex<()>);

#[tauri::command]
async fn engine_request(
    window: tauri::Window,
    gate: State<'_, EngineGate>,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    let _guard = gate
        .0
        .try_lock()
        .map_err(|_| "Já existe uma operação em andamento.")?;
    // Tauri places externalBin next to the application executable, with no target suffix.
    // Never accept an executable name, path, shell string or environment from the WebView.
    let executable =
        std::env::current_exe().map_err(|_| "Diretório do aplicativo indisponível.")?;
    let directory = executable
        .parent()
        .ok_or("Diretório do aplicativo inválido.")?;
    let name = if cfg!(windows) {
        "knowledge-engine.exe"
    } else {
        "knowledge-engine"
    };
    knowledge_bridge::request(&directory.join(name), request).await
}

fn main() {
    tauri::Builder::default()
        .manage(EngineGate(tokio::sync::Mutex::new(())))
        .invoke_handler(tauri::generate_handler![engine_request])
        .run(tauri::generate_context!())
        .expect("Failed to start the desktop application");
}
