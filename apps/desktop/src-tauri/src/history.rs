use serde_json::{json, Value};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Manager;

const LIMIT: usize = 8_000_000;
const ENTRY_LIMIT: usize = 4_000_000;
const RETAIN: usize = 20;

// Receipts come only from the fixed engine, not from imported project JSON.
#[derive(Clone, Default)]
pub struct HistoryFiles(pub Arc<Mutex<VecDeque<Value>>>);

fn validate_entry(entry: &Value) -> Result<(), String> {
    let model = &entry["model"];
    let run = &entry["run"];
    let revision = run["model_revision"].as_str().unwrap_or("");
    if !model["id"].is_string()
        || !model["title"].is_string()
        || !run["run_id"].is_string()
        || !run["engine_version"].is_string()
        || !run["created_at"].is_string()
        || !run["checks"].is_array()
        || !run["values"].is_object()
        || !run["limitations"].is_array()
        || revision.len() != 64
        || !revision.bytes().all(|c| c.is_ascii_hexdigit())
        || !["consistent", "attention", "inconclusive"]
            .contains(&run["outcome"].as_str().unwrap_or(""))
    {
        return Err("Registro de execução inválido.".into());
    }
    let mut total = 0;
    for status in ["passed", "failed", "inconclusive"] {
        let count = run["checks"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|check| check["status"] == status)
            .count() as u64;
        if run["counts"][status].as_u64() != Some(count) {
            return Err("Contagem de execução inválida.".into());
        }
        total += count;
    }
    if total != run["checks"].as_array().unwrap().len() as u64 {
        return Err("Estado de evidência inválido.".into());
    }
    let expected = if run["counts"]["failed"].as_u64().unwrap() > 0 {
        "attention"
    } else if run["counts"]["inconclusive"].as_u64().unwrap() > 0 {
        "inconclusive"
    } else {
        "consistent"
    };
    if run["outcome"] != expected {
        return Err("Estado de execução inválido.".into());
    }
    if serde_json::to_vec(entry)
        .map_err(|_| "Registro inválido.")?
        .len()
        > ENTRY_LIMIT
    {
        return Err("Registro de execução excede 4 MB.".into());
    }
    Ok(())
}

fn empty() -> Value {
    json!({ "format": "nexo-run-history", "version": 1, "evicted": 0, "entries": [] })
}

fn validate_history(value: &Value) -> Result<(), String> {
    let entries = value["entries"].as_array().ok_or("Histórico inválido.")?;
    if value["format"] != "nexo-run-history"
        || value["version"] != 1
        || value["evicted"]
            .as_u64()
            .filter(|n| *n <= 9_007_199_254_740_000)
            .is_none()
        || entries.len() > RETAIN
    {
        return Err("Histórico inválido.".into());
    }
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        validate_entry(entry)?;
        if !ids.insert(entry["run"]["run_id"].as_str().unwrap()) {
            return Err("Execução duplicada no histórico.".into());
        }
    }
    Ok(())
}

fn read(directory: &Path) -> Result<Value, String> {
    let file = match std::fs::File::open(directory.join("history-v1.json")) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(empty()),
        Err(_) => return Err("Não foi possível ler o histórico.".into()),
    };
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Falha ao ler histórico.")?;
    if bytes.len() > LIMIT {
        return Err("Histórico excede 8 MB.".into());
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Histórico corrompido; arquivo preservado.")?;
    validate_history(&value)?;
    Ok(value)
}

fn append(directory: &Path, entry: &Value) -> Result<Value, String> {
    validate_entry(entry)?;
    let mut history = read(directory)?;
    let mut evicted = history["evicted"].as_u64().unwrap();
    let entries = history["entries"].as_array_mut().unwrap();
    if entries
        .iter()
        .any(|old| old["run"]["run_id"] == entry["run"]["run_id"])
    {
        return Ok(history);
    }
    entries.insert(0, entry.clone());
    while entries.len() > RETAIN {
        entries.pop();
        evicted += 1;
    }
    history["evicted"] = json!(evicted);
    while serde_json::to_vec(&history)
        .map_err(|_| "Histórico inválido.")?
        .len()
        > LIMIT
    {
        history["entries"].as_array_mut().unwrap().pop();
        evicted += 1;
        history["evicted"] = json!(evicted);
    }
    std::fs::create_dir_all(directory).map_err(|_| "Pasta de histórico indisponível.")?;
    let mut temp =
        tempfile::NamedTempFile::new_in(directory).map_err(|_| "Falha ao preparar histórico.")?;
    serde_json::to_writer(&mut temp, &history).map_err(|_| "Falha ao gravar histórico.")?;
    temp.flush().map_err(|_| "Falha ao gravar histórico.")?;
    temp.as_file()
        .sync_all()
        .map_err(|_| "Falha ao confirmar histórico.")?;
    temp.persist(directory.join("history-v1.json"))
        .map_err(|_| "Falha ao substituir histórico; arquivo anterior preservado.")?;
    Ok(history)
}

fn acknowledge(
    directory: &Path,
    receipts: &mut VecDeque<Value>,
    run_id: &str,
) -> Result<Value, String> {
    if let Some(position) = receipts
        .iter()
        .position(|entry| entry["run"]["run_id"] == run_id)
    {
        let history = append(directory, &receipts[position])?;
        receipts.remove(position);
        return Ok(history);
    }
    // A lost IPC reply can be retried without fabricating or duplicating a record.
    let history = read(directory)?;
    if history["entries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| entry["run"]["run_id"] == run_id)
    {
        return Ok(history);
    }
    Err("Resposta real do motor não disponível para arquivar. Execute novamente.".into())
}

pub fn remember(files: &HistoryFiles, request: &Value, response: &Value) {
    if request["operation"] != "analyze" || response["ok"] != true {
        return;
    }
    let entry = json!({ "model": request["model"], "run": response["data"] });
    if validate_entry(&entry).is_err() {
        return;
    }
    if let Ok(mut receipts) = files.0.lock() {
        receipts.push_back(entry);
        while receipts.len() > 4 {
            receipts.pop_front();
        }
    }
}

#[tauri::command]
pub async fn history_read(
    window: tauri::Window,
    app: tauri::AppHandle,
    files: tauri::State<'_, HistoryFiles>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Pasta de histórico indisponível.")?;
    let state = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = state.0.lock().map_err(|_| "Histórico indisponível.")?;
        read(&directory)
    })
    .await
    .map_err(|_| "Falha no histórico.".to_string())?
}

#[tauri::command]
pub async fn archive_run(
    window: tauri::Window,
    app: tauri::AppHandle,
    files: tauri::State<'_, HistoryFiles>,
    run_id: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Pasta de histórico indisponível.")?;
    let state = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut receipts = state.0.lock().map_err(|_| "Histórico indisponível.")?;
        acknowledge(&directory, &mut receipts, &run_id)
    })
    .await
    .map_err(|_| "Falha ao arquivar execução.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(id: usize) -> Value {
        json!({ "model": { "id": "synthetic", "title": "Análise térmica" }, "run": {
        "run_id": format!("run_{id}"), "model_revision": "a".repeat(64), "engine_version": "test", "created_at": "2026-10-24T08:00:00Z",
        "outcome": "consistent", "counts": {"passed":0,"failed":0,"inconclusive":0}, "checks": [], "values": {}, "limitations": []
    } })
    }
    #[test]
    fn persistence_retention_deduplication_and_corruption() {
        let folder = tempfile::tempdir().unwrap();
        for id in 0..22 {
            append(folder.path(), &entry(id)).unwrap();
        }
        let history = read(folder.path()).unwrap();
        assert_eq!(history["entries"].as_array().unwrap().len(), 20);
        assert_eq!(history["entries"][0]["run"]["run_id"], "run_21");
        assert_eq!(history["evicted"], 2);
        assert_eq!(append(folder.path(), &entry(21)).unwrap(), history);
        let path = folder.path().join("history-v1.json");
        std::fs::write(&path, b"corrupt").unwrap();
        assert!(append(folder.path(), &entry(23)).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
    }
    #[test]
    fn receipts_only_accept_successful_analysis_and_remain_bounded() {
        let files = HistoryFiles::default();
        for id in 0..6 {
            let entry = entry(id);
            remember(
                &files,
                &json!({"operation":"analyze","model":entry["model"]}),
                &json!({"ok":true,"data":entry["run"]}),
            );
        }
        assert_eq!(files.0.lock().unwrap().len(), 4);
        remember(
            &files,
            &json!({"operation":"import_model"}),
            &json!({"ok":true,"data":entry(7)["run"]}),
        );
        remember(
            &files,
            &json!({"operation":"analyze"}),
            &json!({"ok":false}),
        );
        assert_eq!(files.0.lock().unwrap().len(), 4);
    }
    #[test]
    fn rejected_record_and_bad_destination_leave_original() {
        let folder = tempfile::tempdir().unwrap();
        append(folder.path(), &entry(1)).unwrap();
        let mut bad = entry(2);
        bad["run"]["counts"]["passed"] = json!(1);
        assert!(append(folder.path(), &bad).is_err());
        bad = entry(2);
        bad["run"]["checks"] = json!([{"status":"unknown"}]);
        assert!(append(folder.path(), &bad).is_err());
        assert_eq!(
            read(folder.path()).unwrap()["entries"][0]["run"]["run_id"],
            "run_1"
        );
        let original = folder.path().join("original.nexo");
        std::fs::write(&original, b"original").unwrap();
        assert!(append(&original, &entry(3)).is_err());
        assert_eq!(std::fs::read(&original).unwrap(), b"original");
    }
    #[test]
    fn acknowledgement_cannot_create_a_forged_run_and_can_retry_a_real_receipt() {
        let folder = tempfile::tempdir().unwrap();
        let mut receipts = VecDeque::from([entry(1)]);
        assert!(acknowledge(folder.path(), &mut receipts, "forged").is_err());
        assert!(!folder.path().join("history-v1.json").exists());
        assert_eq!(receipts.len(), 1);
        let stored = acknowledge(folder.path(), &mut receipts, "run_1").unwrap();
        assert!(receipts.is_empty());
        assert_eq!(
            acknowledge(folder.path(), &mut receipts, "run_1").unwrap(),
            stored
        );
    }
    #[test]
    fn byte_budget_and_failed_acknowledgement_keep_recent_data_and_receipt() {
        let folder = tempfile::tempdir().unwrap();
        for id in 0..3 {
            let mut record = entry(id);
            record["model"]["synthetic_padding"] = json!("x".repeat(3_000_000));
            append(folder.path(), &record).unwrap();
        }
        let history = read(folder.path()).unwrap();
        assert_eq!(history["entries"].as_array().unwrap().len(), 2);
        assert_eq!(history["evicted"], 1);
        let path = folder.path().join("history-v1.json");
        std::fs::write(&path, b"corrupt").unwrap();
        let mut receipts = VecDeque::from([entry(9)]);
        assert!(acknowledge(folder.path(), &mut receipts, "run_9").is_err());
        assert_eq!(receipts.len(), 1);
        assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
    }
}
