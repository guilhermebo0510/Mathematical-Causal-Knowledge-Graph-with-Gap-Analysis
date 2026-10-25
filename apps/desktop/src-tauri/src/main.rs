#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::State;
mod history;
mod operations;
#[cfg(windows)]
mod pipe_security;
mod project_files;
mod proposal_journal;
mod proposal_session;
mod recovery;

// One request at a time; the bridge drains bounded stdout/stderr and reaps on failure.
struct EngineGate(tokio::sync::Mutex<()>);

#[tauri::command]
async fn engine_request(
    window: tauri::Window,
    gate: State<'_, EngineGate>,
    history: State<'_, history::HistoryFiles>,
    operations: State<'_, operations::EngineOperations>,
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
    let id = request
        .get("id")
        .and_then(|x| x.as_str())
        .ok_or("ID de operação ausente.")?;
    let mut operation = operations.begin(id)?;
    let result = knowledge_bridge::request_cancellable(
        &directory.join(name),
        request.clone(),
        operation.receiver(),
    )
    .await;
    if result
        .as_ref()
        .err()
        .is_some_and(|error| error == knowledge_bridge::TERMINATION_UNCONFIRMED)
    {
        operations.quarantine()?;
    }
    let cancelled = operation.finish()?;
    let response = result?;
    if cancelled {
        return Err(knowledge_bridge::CANCELLED.into());
    }
    history::remember(history.inner(), &request, &response);
    Ok(response)
}

#[tauri::command]
fn cancel_engine_request(
    window: tauri::Window,
    operations: State<'_, operations::EngineOperations>,
    operation_id: String,
) -> Result<serde_json::Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    Ok(serde_json::json!({"state":operations.cancel(&operation_id)?}))
}

fn main() {
    tauri::Builder::default()
        .manage(project_files::ProjectFiles::default())
        .manage(recovery::RecoveryFiles::default())
        .manage(history::HistoryFiles::default())
        .manage(proposal_journal::ProposalFiles::default())
        .manage(proposal_session::ProposalSessions::default())
        .manage(EngineGate(tokio::sync::Mutex::new(())))
        .manage(operations::EngineOperations::default())
        .invoke_handler(tauri::generate_handler![
            engine_request,
            cancel_engine_request,
            project_files::open_project_file,
            project_files::save_project_file,
            project_files::forget_project_file,
            project_files::adopt_open_project,
            recovery::recovery_storage,
            history::history_read,
            history::archive_run,
            proposal_journal::proposal_journal,
            proposal_session::proposal_session
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start the desktop application");
}
