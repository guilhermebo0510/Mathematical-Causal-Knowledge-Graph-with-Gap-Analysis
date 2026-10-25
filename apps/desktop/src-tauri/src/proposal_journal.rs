use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Manager;

const LIMIT: usize = 8_000_000;
const RETAIN: usize = 20;
#[derive(Clone, Default)]
pub struct ProposalFiles(pub Arc<Mutex<()>>);

fn invalid() -> String {
    "Registro de proposta inválido.".into()
}
fn valid_date(v: &Value) -> bool {
    // Dates are local UI observations, not authenticated timestamps.
    v.as_str().is_some_and(|s| {
        let b = s.as_bytes();
        b.len() == 24
            && b.iter().enumerate().all(|(i, c)| match i {
                4 | 7 => *c == b'-',
                10 => *c == b'T',
                13 | 16 => *c == b':',
                19 => *c == b'.',
                23 => *c == b'Z',
                _ => c.is_ascii_digit(),
            })
    })
}
pub(crate) fn validate_entry(e: &Value) -> Result<(), String> {
    let object = e.as_object().ok_or_else(invalid)?;
    let id = e["id"].as_str().ok_or_else(invalid)?;
    let p = &e["proposal"];
    let proposal = p.as_object().ok_or_else(invalid)?;
    // Recheck envelope independently; stored data is never an engine receipt or trusted authorship.
    if object.len() != if e.get("delivery").is_some() { 6 } else { 5 }
        || !object.keys().all(|k| {
            [
                "id",
                "createdAt",
                "updatedAt",
                "state",
                "proposal",
                "delivery",
            ]
            .contains(&k.as_str())
        })
        || id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || !valid_date(&e["createdAt"])
        || !valid_date(&e["updatedAt"])
        || !["pending", "applied", "rejected", "failed", "unconfirmed"]
            .contains(&e["state"].as_str().unwrap_or(""))
        || proposal.len() != 9
        || !proposal.keys().all(|k| {
            [
                "format",
                "version",
                "project_id",
                "author",
                "reason",
                "base_revision",
                "target_revision",
                "base_model",
                "candidate_model",
            ]
            .contains(&k.as_str())
        })
        || p["format"] != "nexo-change-proposal"
        || p["version"] != 1
        || !["project_id", "author", "reason"].iter().all(|k| {
            p[k].as_str()
                .is_some_and(|s| !s.is_empty() && s.chars().count() <= 300)
        })
        || !["base_revision", "target_revision"].iter().all(|k| {
            p[k].as_str().is_some_and(|s| {
                s.len() == 64
                    && s.bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
        })
        || !p["base_model"].is_object()
        || !p["candidate_model"].is_object()
        || p["base_model"]["id"] != p["project_id"]
        || p["candidate_model"]["id"] != p["project_id"]
        || serde_json::to_vec(p).map_err(|_| invalid())?.len() > 600_000
    {
        return Err(invalid());
    }
    if let Some(delivery) = e.get("delivery") {
        if delivery.as_object().is_none_or(|m| {
            m.len() != 2 || !m.keys().all(|k| ["sessionId", "id"].contains(&k.as_str()))
        }) || !["sessionId", "id"].iter().all(|k| {
            delivery[k].as_str().is_some_and(|v| {
                !v.is_empty()
                    && v.len() <= 80
                    && v.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            })
        }) {
            return Err("Vínculo de entrega inválido.".into());
        }
    }
    for key in ["base_model", "candidate_model"] {
        let model = &p[key];
        if !model["title"].is_string()
            || !model["description"].is_string()
            || ![
                "variables",
                "equations",
                "assumptions",
                "requirements",
                "observations",
            ]
            .iter()
            .all(|kind| {
                model[kind]
                    .as_array()
                    .is_some_and(|nodes| nodes.iter().all(|n| n.is_object() && n["id"].is_string()))
            })
        {
            return Err(invalid());
        }
    }
    Ok(())
}
fn empty() -> Value {
    json!({"format":"nexo-proposal-journal","version":2,"evicted":0,"entries":[]})
}
fn validate(j: &Value) -> Result<(), String> {
    let entries = j["entries"].as_array().ok_or_else(invalid)?;
    if j.as_object().is_none_or(|o| {
        o.len() != 4
            || !o
                .keys()
                .all(|k| ["format", "version", "evicted", "entries"].contains(&k.as_str()))
    }) || j["format"] != "nexo-proposal-journal"
        || (j["version"] != 1 && j["version"] != 2)
        || j["evicted"]
            .as_u64()
            .filter(|v| *v <= 9_007_199_254_740_000)
            .is_none()
        || entries.len() > RETAIN
    {
        return Err(invalid());
    }
    let mut ids = std::collections::HashSet::new();
    for e in entries {
        validate_entry(e)?;
        if j["version"] == 1 && e.get("delivery").is_some() {
            return Err(invalid());
        }
        if !ids.insert(e["id"].as_str().unwrap()) {
            return Err(invalid());
        }
    }
    Ok(())
}
pub(crate) fn read(directory: &Path) -> Result<Value, String> {
    let file = match std::fs::File::open(directory.join("proposal-journal-v2.json")) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            match std::fs::File::open(directory.join("proposal-journal-v1.json")) {
                Ok(f) => f,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(empty()),
                Err(_) => return Err("Não foi possível ler o registro de propostas.".into()),
            }
        }
        Err(_) => return Err("Não foi possível ler o registro de propostas.".into()),
    };
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() > LIMIT {
        return Err("Registro de propostas excede 8 MB.".into());
    }
    let mut value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Registro de propostas corrompido; arquivo preservado.")?;
    validate(&value)?;
    value["version"] = json!(2);
    Ok(value)
}
fn storage(directory: &Path, action: &str, value: Value) -> Result<Value, String> {
    let mut j = read(directory)?;
    if action == "read" {
        return Ok(j);
    }
    let protected_id = value["id"].clone();
    let entries = j["entries"].as_array_mut().unwrap();
    match action {
        "start" => {
            validate_entry(&value)?;
            if !["pending", "rejected"].contains(&value["state"].as_str().unwrap()) {
                return Err("Decisão inicial inválida.".into());
            }
            if let Some(old) = entries.iter().find(|e| e["id"] == value["id"]) {
                return if old == &value {
                    Ok(j)
                } else {
                    Err("ID de decisão já utilizado.".into())
                };
            }
            entries.insert(0, value);
        }
        "finish" => {
            if !["applied", "failed", "unconfirmed"]
                .contains(&value["state"].as_str().unwrap_or(""))
                || !valid_date(&value["updatedAt"])
            {
                return Err("Transição de proposta inválida.".into());
            }
            let entry = entries
                .iter_mut()
                .find(|e| e["id"] == value["id"])
                .ok_or("Decisão não encontrada.")?;
            if entry["state"] == value["state"] {
                return Ok(j);
            }
            if entry["state"] != "pending" {
                return Err("Decisão já finalizada.".into());
            }
            entry["state"] = value["state"].clone();
            entry["updatedAt"] = value["updatedAt"].clone();
        }
        _ => return Err("Operação de registro inválida.".into()),
    }
    let mut evicted = j["evicted"].as_u64().unwrap();
    while j["entries"].as_array().unwrap().len() > RETAIN
        || serde_json::to_vec(&j).map_err(|_| invalid())?.len() > LIMIT
    {
        let entries = j["entries"].as_array_mut().unwrap();
        let index = entries
            .iter()
            .rposition(|e| e["state"] != "pending" && e["id"] != protected_id)
            .ok_or("Registro cheio de decisões pendentes. Nenhuma decisão foi removida.")?;
        entries.remove(index);
        evicted += 1;
        j["evicted"] = json!(evicted);
    }
    std::fs::create_dir_all(directory).map_err(|_| "Pasta de propostas indisponível.")?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)
        .map_err(|_| "Falha ao preparar registro de propostas.")?;
    serde_json::to_writer(&mut temp, &j).map_err(|_| "Falha ao gravar registro de propostas.")?;
    temp.flush().map_err(|_| invalid())?;
    temp.as_file().sync_all().map_err(|_| invalid())?;
    temp.persist(directory.join("proposal-journal-v2.json"))
        .map_err(|_| "Falha ao substituir registro de propostas; arquivo anterior preservado.")?;
    Ok(j)
}
#[tauri::command]
pub async fn proposal_journal(
    window: tauri::Window,
    app: tauri::AppHandle,
    files: tauri::State<'_, ProposalFiles>,
    action: String,
    value: Option<Value>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Pasta de propostas indisponível.")?;
    let gate = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = gate.0.lock().map_err(|_| invalid())?;
        storage(&directory, &action, value.unwrap_or(Value::Null))
    })
    .await
    .map_err(|_| invalid())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(id: &str, state: &str) -> Value {
        let model = json!({"id":"p","title":"Synthetic","description":"Control","schema_version":1,"variables":[],"equations":[],"assumptions":[],"requirements":[],"observations":[]});
        json!({"id":id,"createdAt":"2026-10-24T10:00:00.000Z","updatedAt":"2026-10-24T10:00:00.000Z","state":state,"proposal":{
            "format":"nexo-change-proposal","version":1,"project_id":"p","author":"Synthetic","reason":"Test","base_revision":"a".repeat(64),"target_revision":"b".repeat(64),"base_model":model,"candidate_model":model
        }})
    }
    fn finish(id: &str, state: &str) -> Value {
        json!({"id":id,"state":state,"updatedAt":"2026-10-24T10:01:00.000Z"})
    }
    #[test]
    fn count_pressure_preserves_pending_intents_and_refuses_new_record_without_writing() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        for n in 0..20 {
            storage(dir, "start", entry(&format!("p{n}"), "pending")).unwrap();
        }
        let path = dir.join("proposal-journal-v2.json");
        let before = std::fs::read(&path).unwrap();
        for state in ["pending", "rejected"] {
            assert!(storage(dir, "start", entry("blocked", state))
                .unwrap_err()
                .contains("pendentes"));
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
        storage(dir, "finish", finish("p10", "applied")).unwrap();
        storage(dir, "start", entry("new", "pending")).unwrap();
        let journal = read(dir).unwrap();
        let entries = journal["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 20);
        assert_eq!(journal["evicted"], 1);
        assert!(entries
            .iter()
            .any(|e| e["id"] == "p0" && e["state"] == "pending"));
        assert!(!entries.iter().any(|e| e["id"] == "p10"));
        assert_eq!(entries[0]["id"], "new");
    }
    #[test]
    fn byte_pressure_cannot_remove_pending_intents_or_acknowledge_an_evicted_new_record() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        let large = |id: &str, state: &str| {
            let mut e = entry(id, state);
            e["proposal"]["base_model"]["description"] = json!("x".repeat(280000));
            e["proposal"]["candidate_model"]["description"] = json!("y".repeat(280000));
            e
        };
        for n in 0..14 {
            storage(dir, "start", large(&format!("large{n}"), "pending")).unwrap();
        }
        let path = dir.join("proposal-journal-v2.json");
        let before = std::fs::read(&path).unwrap();
        assert!(storage(dir, "start", large("blocked", "rejected"))
            .unwrap_err()
            .contains("pendentes"));
        assert_eq!(std::fs::read(&path).unwrap(), before);
        storage(dir, "finish", finish("large0", "applied")).unwrap();
        storage(dir, "start", large("new", "rejected")).unwrap();
        let j = read(dir).unwrap();
        let entries = j["entries"].as_array().unwrap();
        assert_eq!(entries[0]["id"], "new");
        assert_eq!(j["evicted"], 1);
        assert_eq!(
            entries.iter().filter(|e| e["state"] == "pending").count(),
            13
        );
        assert!(!entries.iter().any(|e| e["id"] == "large0"));
    }
    #[test]
    fn migrates_v1_on_write_without_replacing_original_and_never_falls_back_from_corrupt_v2() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        let legacy = json!({"format":"nexo-proposal-journal","version":1,"evicted":0,"entries":[entry("legacy","rejected")]});
        let raw = serde_json::to_vec(&legacy).unwrap();
        std::fs::write(dir.join("proposal-journal-v1.json"), &raw).unwrap();
        assert_eq!(read(dir).unwrap()["version"], 2);
        assert!(!dir.join("proposal-journal-v2.json").exists());
        let mut linked = entry("linked", "pending");
        linked["delivery"] = json!({"sessionId":"session","id":"delivery"});
        storage(dir, "start", linked).unwrap();
        assert_eq!(read(dir).unwrap()["entries"].as_array().unwrap().len(), 2);
        assert_eq!(
            std::fs::read(dir.join("proposal-journal-v1.json")).unwrap(),
            raw
        );
        std::fs::write(dir.join("proposal-journal-v2.json"), "broken").unwrap();
        assert!(storage(dir, "start", entry("x", "pending")).is_err());
        assert_eq!(
            std::fs::read_to_string(dir.join("proposal-journal-v2.json")).unwrap(),
            "broken"
        );
    }
    #[test]
    fn delivery_metadata_cannot_persist_connection_credentials() {
        let temp = tempfile::tempdir().unwrap();
        let mut linked = entry("linked", "pending");
        linked["delivery"] =
            json!({"sessionId":"session","id":"delivery","token":"must-not-persist"});
        assert!(storage(temp.path(), "start", linked).is_err());
        assert!(!temp.path().join("proposal-journal-v2.json").exists());
    }
    #[test]
    fn transitions_persist_intent_and_refuse_rewriting_a_decision() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        assert!(storage(dir, "start", entry("a", "applied")).is_err());
        storage(dir, "start", entry("a", "pending")).unwrap();
        assert_eq!(read(dir).unwrap()["entries"][0]["state"], "pending");
        storage(dir, "start", entry("a", "pending")).unwrap();
        storage(dir, "finish", finish("a", "applied")).unwrap();
        storage(dir, "finish", finish("a", "applied")).unwrap();
        assert!(storage(dir, "finish", finish("a", "failed")).is_err());
        assert!(storage(dir, "start", entry("a", "rejected")).is_err());
        assert!(storage(dir, "finish", finish("unknown", "applied")).is_err());
        assert_eq!(read(dir).unwrap()["entries"].as_array().unwrap().len(), 1);
        storage(dir, "start", entry("b", "rejected")).unwrap();
        assert!(storage(dir, "finish", finish("b", "applied")).is_err());
    }
    #[test]
    fn corrupt_or_oversized_store_is_preserved_without_new_write() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("proposal-journal-v1.json");
        for raw in [b"broken".to_vec(), vec![b' '; LIMIT + 1]] {
            std::fs::write(&path, &raw).unwrap();
            assert!(storage(temp.path(), "start", entry("a", "pending")).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), raw);
        }
    }
    #[test]
    fn retention_and_failed_finish_do_not_change_models_or_other_files() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        std::fs::write(dir.join("recovery-v1.json"), "preserve").unwrap();
        for n in 0..22 {
            storage(dir, "start", entry(&format!("e{n}"), "rejected")).unwrap();
        }
        let j = read(dir).unwrap();
        assert_eq!(j["evicted"], 2);
        assert_eq!(j["entries"].as_array().unwrap().len(), 20);
        storage(dir, "start", entry("pending", "pending")).unwrap();
        storage(dir, "finish", finish("pending", "failed")).unwrap();
        assert_eq!(read(dir).unwrap()["entries"][0]["state"], "failed");
        assert_eq!(
            std::fs::read_to_string(dir.join("recovery-v1.json")).unwrap(),
            "preserve"
        );
        let before = std::fs::read(dir.join("proposal-journal-v2.json")).unwrap();
        let mut malformed = entry("bad", "pending");
        malformed["proposal"]["base_model"]["variables"] = json!([null]);
        assert!(storage(dir, "start", malformed).is_err());
        assert_eq!(
            std::fs::read(dir.join("proposal-journal-v2.json")).unwrap(),
            before
        );
        assert!(storage(dir, "clear", Value::Null).is_err());
    }
}
