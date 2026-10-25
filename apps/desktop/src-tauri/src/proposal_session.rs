use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
const TTL: Duration = Duration::from_secs(15 * 60);
const UI_LEASE: Duration = Duration::from_secs(10);
const FRAME_LIMIT: usize = 620_000;
const TOTAL_LIMIT: usize = 2_000_000;
#[path = "proposal_inbox.rs"]
mod durable;

#[derive(Clone, Default)]
pub struct ProposalSessions(Arc<Mutex<Option<Session>>>);
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    id: String,
    proposal: Value,
    state: String,
    decision_id: Option<String>,
}
impl Entry {
    fn receipt(&self) -> Value {
        let mut value = json!({"id":self.id,"state":self.state});
        if let Some(id) = &self.decision_id {
            value["decision_id"] = json!(id);
        }
        value
    }
}
struct Session {
    id: String,
    token: String,
    pipe: String,
    base: Value,
    started: Instant,
    last_seen: Instant,
    entries: Vec<Entry>,
    bytes: usize,
    error: Option<String>,
    directory: Option<std::path::PathBuf>,
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
// Model quantities are finite f64s. JavaScript serializes 100.0 as 100; that
// transport spelling must not create a false base conflict. No epsilon, coercion
// from strings, reordering of arrays or trust in a sender's revision hash.
fn same_content(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => {
            a == b || a.as_f64().zip(b.as_f64()).is_some_and(|(a, b)| a == b)
        }
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| same_content(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(k, a)| b.get(k).is_some_and(|b| same_content(a, b)))
        }
        _ => a == b,
    }
}
fn checked<'a>(slot: &'a mut Option<Session>, id: &str) -> Result<&'a mut Session, String> {
    let session = slot
        .as_mut()
        .filter(|s| s.id == id && s.started.elapsed() < TTL && s.last_seen.elapsed() < UI_LEASE)
        .ok_or("Sessão encerrada ou expirada.")?;
    if let Some(error) = &session.error {
        return Err(error.clone());
    }
    Ok(session)
}
impl Session {
    fn new(base: Value) -> Result<Self, String> {
        if !base.is_object()
            || !base["id"].as_str().is_some_and(valid_id)
            || serde_json::to_vec(&base)
                .map_err(|_| "Modelo inválido.")?
                .len()
                > 256_000
        {
            return Err("Modelo inválido para conexão.".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        Ok(Self {
            id: id.clone(),
            token: uuid::Uuid::new_v4().simple().to_string(),
            pipe: format!("nexo-proposals-{id}"),
            base,
            started: Instant::now(),
            last_seen: Instant::now(),
            entries: vec![],
            bytes: 0,
            error: None,
            directory: None,
        })
    }
    fn receive(&mut self, request: Value, now: Instant) -> Result<Value, String> {
        let before = self.entries.clone();
        let bytes = self.bytes;
        let result = self.receive_inner(request, now)?;
        if self.entries.len() != before.len() {
            if let Some(directory) = &self.directory {
                if let Err(error) = durable::put(directory, &self.id, self.entries.last().unwrap())
                {
                    self.entries = before;
                    self.bytes = bytes;
                    return Err(error);
                }
            }
        }
        Ok(result)
    }
    fn receive_inner(&mut self, request: Value, now: Instant) -> Result<Value, String> {
        if now.duration_since(self.started) >= TTL
            || now.saturating_duration_since(self.last_seen) >= UI_LEASE
        {
            return Err("Sessão encerrada ou expirada.".into());
        }
        let obj = request.as_object().ok_or("Requisição local inválida.")?;
        let token = request["token"].as_str().unwrap_or("");
        let same = token.len() == self.token.len()
            && token
                .bytes()
                .zip(self.token.bytes())
                .fold(0u8, |a, (b, c)| a | (b ^ c))
                == 0;
        if !same {
            return Err("Conexão local não autorizada.".into());
        }
        let id = request["id"]
            .as_str()
            .filter(|v| valid_id(v))
            .ok_or("ID de entrega inválido.")?;
        if request["operation"] == "status" && obj.len() == 3 {
            let entry = self
                .entries
                .iter()
                .find(|e| e.id == id)
                .ok_or("Entrega não encontrada.")?;
            return Ok(entry.receipt());
        }
        if request["operation"] != "submit"
            || obj.len() != 4
            || !obj
                .keys()
                .all(|k| ["operation", "id", "token", "proposal"].contains(&k.as_str()))
        {
            return Err("Requisição local inválida.".into());
        }
        let p = &request["proposal"];
        if let Some(existing) = self.entries.iter().find(|e| e.id == id) {
            return if same_content(&existing.proposal, p) {
                Ok(existing.receipt())
            } else {
                Err("ID de entrega já utilizado com outro conteúdo.".into())
            };
        }
        if p.as_object().is_none_or(|m| {
            m.len() != 9
                || !m.keys().all(|k| {
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
        }) || p["format"] != "nexo-change-proposal"
            || p["version"] != 1
            || p["project_id"] != self.base["id"]
            || !same_content(&p["base_model"], &self.base)
            || p["candidate_model"]["id"] != self.base["id"]
            || !["author", "reason"].iter().all(|k| {
                p[k].as_str()
                    .is_some_and(|v| !v.is_empty() && v.encode_utf16().count() <= 300)
            })
            || !["base_revision", "target_revision"].iter().all(|k| {
                p[k].as_str().is_some_and(|v| {
                    v.len() == 64
                        && v.bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                })
            })
        {
            return Err("Proposta inválida ou base diferente da conexão.".into());
        }
        let bytes = serde_json::to_vec(p)
            .map_err(|_| "Proposta inválida.")?
            .len();
        if bytes > 600_000 {
            return Err("Proposta excede 600 KB.".into());
        }
        if self.entries.len() >= 32
            || self
                .entries
                .iter()
                .filter(|e| ["queued", "reviewing", "unconfirmed"].contains(&e.state.as_str()))
                .count()
                >= 8
            || self.bytes + bytes > TOTAL_LIMIT
        {
            return Err(
                "Fila ou retenção da sessão cheia. Reconecte após revisar as entregas.".into(),
            );
        }
        self.bytes += bytes;
        self.entries.push(Entry {
            id: id.into(),
            proposal: p.clone(),
            state: "queued".into(),
            decision_id: None,
        });
        Ok(json!({"id":id,"state":"queued"}))
    }
    fn summary(&self) -> Value {
        json!({"id":self.id,"projectId":self.base["id"],"remainingSeconds":TTL.saturating_sub(self.started.elapsed()).as_secs(),"entries":self.entries.iter().map(|e|json!({"id":e.id,"state":e.state,"author":e.proposal["author"],"reason":e.proposal["reason"]})).collect::<Vec<_>>()})
    }
    fn resolve(&mut self, id: &str, state: &str) -> Result<Value, String> {
        if ![
            "reviewing",
            "applied",
            "rejected",
            "conflict",
            "failed",
            "unconfirmed",
            "closed",
        ]
        .contains(&state)
        {
            return Err("Estado de entrega inválido.".into());
        }
        let entry = self
            .entries
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("Entrega não encontrada.")?;
        let allowed = entry.state == state
            || match entry.state.as_str() {
                "queued" => ["reviewing", "rejected", "conflict", "failed"].contains(&state),
                "reviewing" => ["applied", "failed", "unconfirmed", "closed"].contains(&state),
                "unconfirmed" => ["applied", "failed", "closed"].contains(&state),
                _ => false,
            };
        if !allowed {
            return Err("Entrega já finalizada.".into());
        }
        entry.state = state.into();
        Ok(entry.receipt())
    }

    fn resolve_persisted(
        &mut self,
        directory: &std::path::Path,
        id: &str,
        state: &str,
        decision_id: Option<&str>,
    ) -> Result<Value, String> {
        let entry = self
            .entries
            .iter()
            .find(|e| e.id == id)
            .ok_or("Entrega não encontrada.")?;
        if entry
            .decision_id
            .as_deref()
            .is_some_and(|known| Some(known) != decision_id)
        {
            return Err("Decisão persistida não corresponde à entrega.".into());
        }
        let audited = ["reviewing", "applied", "rejected", "closed"].contains(&state)
            || (state == "failed" && (decision_id.is_some() || entry.decision_id.is_some()));
        if audited {
            let decision = decision_id
                .filter(|id| valid_id(id))
                .ok_or("Confirmação persistida indisponível para a entrega.")?;
            let journal = crate::proposal_journal::read(directory)?;
            let record = journal["entries"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["id"].as_str() == Some(decision))
                .ok_or("Confirmação persistida indisponível para a entrega.")?;
            let expected = if state == "closed" {
                "unconfirmed"
            } else if state == "reviewing" {
                "pending"
            } else {
                state
            };
            if record["state"] != expected
                || record["delivery"]["sessionId"].as_str() != Some(self.id.as_str())
                || record["delivery"]["id"].as_str() != Some(id)
                || !same_content(&record["proposal"], &entry.proposal)
            {
                return Err("Decisão persistida não corresponde à entrega.".into());
            }
        } else if state == "unconfirmed" {
            if entry.decision_id.is_none() || entry.decision_id.as_deref() != decision_id {
                return Err("Confirmação persistida indisponível para a entrega.".into());
            }
        } else if decision_id.is_some() {
            return Err("Vínculo de entrega inválido.".into());
        }
        let before = self.entries.iter().find(|e| e.id == id).unwrap().clone();
        self.resolve(id, state)?;
        let entry = self.entries.iter_mut().find(|e| e.id == id).unwrap();
        if audited {
            entry.decision_id = decision_id.map(str::to_string);
        }
        if let Some(directory) = &self.directory {
            if let Err(error) = durable::put(directory, &self.id, entry) {
                *entry = before;
                return Err(error);
            }
        }
        Ok(entry.receipt())
    }
}

#[cfg(windows)]
fn pipe(
    name: &str,
    first: bool,
) -> Result<tokio::net::windows::named_pipe::NamedPipeServer, String> {
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    let security = crate::pipe_security::current_user()?;
    let mut attrs = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: security.0,
        bInheritHandle: 0,
    };
    let mut options = tokio::net::windows::named_pipe::ServerOptions::new();
    options
        .first_pipe_instance(first)
        .reject_remote_clients(true)
        .max_instances(2);
    // SAFETY: descriptor and attributes stay valid until CreateNamedPipe completes.
    unsafe {
        options.create_with_security_attributes_raw(
            format!(r"\\.\pipe\{name}"),
            (&mut attrs as *mut SECURITY_ATTRIBUTES).cast(),
        )
    }
    .map_err(|_| "Canal local indisponível.".into())
}

#[cfg(windows)]
async fn serve(
    mut server: tokio::net::windows::named_pipe::NamedPipeServer,
    files: ProposalSessions,
    id: String,
    name: String,
) {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    loop {
        let connected = tokio::select! {
            result=server.connect()=>result.is_ok(),
            _=tokio::time::sleep(Duration::from_millis(500))=>{
                let mut slot=match files.0.lock(){Ok(s)=>s,Err(_)=>return};
                if checked(&mut slot,&id).is_err(){return;} continue;
            }
        };
        if !connected {
            if let Ok(mut slot) = files.0.lock() {
                if let Some(s) = slot.as_mut().filter(|s| s.id == id) {
                    s.error = Some("Canal local indisponível.".into());
                }
            }
            return;
        }
        let next = match pipe(&name, false) {
            Ok(s) => s,
            Err(error) => {
                if let Ok(mut slot) = files.0.lock() {
                    if let Some(s) = slot.as_mut().filter(|s| s.id == id) {
                        s.error = Some(error);
                    }
                }
                return;
            }
        };
        let (reader, mut writer) = tokio::io::split(server);
        let mut reader = BufReader::new(reader.take(FRAME_LIMIT as u64 + 1));
        let exchange = async {
            let mut line = vec![];
            let read = reader.read_until(b'\n', &mut line).await;
            let response = if read.is_err()
                || line.len() > FRAME_LIMIT
                || line.last() != Some(&b'\n')
            {
                Err("Requisição local inválida ou excessiva.".to_string())
            } else if let Ok(request) = serde_json::from_slice(&line) {
                files
                    .0
                    .lock()
                    .map_err(|_| "Sessão indisponível.".to_string())
                    .and_then(|mut slot| checked(&mut slot, &id)?.receive(request, Instant::now()))
            } else {
                Err("JSON local inválido.".into())
            };
            let envelope = match response {
                Ok(data) => json!({"ok":true,"data":data}),
                Err(error) => json!({"ok":false,"error":error}),
            };
            let mut bytes = serde_json::to_vec(&envelope).unwrap();
            bytes.push(b'\n');
            let _ = writer.write_all(&bytes).await;
        };
        let _ = tokio::time::timeout(Duration::from_secs(3), exchange).await;
        drop(reader);
        drop(writer);
        server = next;
    }
}

#[tauri::command]
pub async fn proposal_session(
    window: tauri::Window,
    app: tauri::AppHandle,
    files: tauri::State<'_, ProposalSessions>,
    action: String,
    session_id: Option<String>,
    value: Option<Value>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    let value = value.unwrap_or(Value::Null);
    if action == "start" {
        #[cfg(not(windows))]
        {
            return Err("Conexão direta disponível somente no Windows.".into());
        }
        #[cfg(windows)]
        {
            let mut session = Session::new(value)?;
            session.directory = Some(
                app.path()
                    .app_local_data_dir()
                    .map_err(|_| "Pasta de propostas indisponível.")?,
            );
            durable::read(session.directory.as_ref().unwrap())?;
            let listener = pipe(&session.pipe, true)?;
            let code=json!({"format":"nexo-local-session","version":1,"pipe":session.pipe,"token":session.token,"project_id":session.base["id"]}).to_string();
            let response = json!({"id":session.id,"code":code,"projectId":session.base["id"]});
            let id = session.id.clone();
            let name = session.pipe.clone();
            *files.0.lock().map_err(|_| "Sessão indisponível.")? = Some(session);
            tauri::async_runtime::spawn(serve(listener, files.inner().clone(), id, name));
            return Ok(response);
        }
    }
    let mut slot = files.0.lock().map_err(|_| "Sessão indisponível.")?;
    if action.starts_with("saved_") {
        let directory = app
            .path()
            .app_local_data_dir()
            .map_err(|_| "Pasta de propostas indisponível.")?;
        let records = durable::read(&directory)?;
        if action == "saved_list" {
            return Ok(json!(records.iter().filter(|r|r.entry.proposal["project_id"]==value["projectId"]).map(|r|json!({"sessionId":r.session_id,"id":r.entry.id,"state":r.entry.state,"author":r.entry.proposal["author"],"reason":r.entry.proposal["reason"]})).collect::<Vec<_>>()));
        }
        let id = session_id.as_deref().ok_or("Sessão ausente.")?;
        let record = records
            .into_iter()
            .find(|r| r.session_id == id && r.entry.id == value["id"])
            .ok_or("Entrega não encontrada.")?;
        if action == "saved_get" {
            return Ok(record.entry.proposal);
        }
        if action == "saved_resolve" {
            if let Some(session) = slot
                .as_mut()
                .filter(|s| s.id == id && s.entries.iter().any(|e| e.id == record.entry.id))
            {
                return session.resolve_persisted(
                    &directory,
                    value["id"].as_str().unwrap_or(""),
                    value["state"].as_str().unwrap_or(""),
                    value["decisionId"].as_str(),
                );
            }
            let mut recovered = Session::new(record.entry.proposal["base_model"].clone())?;
            recovered.id = id.into();
            recovered.entries = vec![record.entry];
            recovered.directory = Some(directory.clone());
            return recovered.resolve_persisted(
                &directory,
                value["id"].as_str().unwrap_or(""),
                value["state"].as_str().unwrap_or(""),
                value["decisionId"].as_str(),
            );
        }
        return Err("Operação de sessão inválida.".into());
    }
    let id = session_id.ok_or("Sessão ausente.")?;
    if action == "stop" {
        if slot.as_ref().is_some_and(|s| s.id == id) {
            *slot = None;
        }
        return Ok(json!({"closed":true}));
    }
    let session = checked(&mut slot, &id)?;
    match action.as_str() {
        "read" => {
            session.last_seen = Instant::now();
            Ok(session.summary())
        }
        "get" => Ok(session
            .entries
            .iter()
            .find(|e| e.id == value["id"])
            .ok_or("Entrega não encontrada.")?
            .proposal
            .clone()),
        "resolve" => session.resolve_persisted(
            &app.path()
                .app_local_data_dir()
                .map_err(|_| "Pasta de propostas indisponível.")?,
            value["id"].as_str().unwrap_or(""),
            value["state"].as_str().unwrap_or(""),
            value["decisionId"].as_str(),
        ),
        _ => Err("Operação de sessão inválida.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Session {
        Session::new(json!({"schema_version":1,"id":"p","title":"Synthetic","description":"Control","variables":[],"equations":[],"assumptions":[],"requirements":[],"observations":[]})).unwrap()
    }
    #[test]
    fn inbox_survives_restart_without_capabilities_and_write_failure_is_not_acknowledged() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = sample();
        session.directory = Some(temp.path().into());
        let request = submit(&session, "durable");
        session.receive(request.clone(), session.started).unwrap();
        session.receive(request, session.started).unwrap();
        let records = durable::read(temp.path()).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].entry.id, "durable");
        assert_eq!(records[0].entry.state, "queued");
        let raw = std::fs::read_to_string(temp.path().join("proposal-inbox-v1.json")).unwrap();
        assert!(!raw.contains(&session.token));
        assert!(!raw.contains(&session.pipe));
        drop(session);
        assert_eq!(durable::read(temp.path()).unwrap().len(), 1);
        std::fs::write(temp.path().join("proposal-inbox-v1.json"), "broken").unwrap();
        let mut another = sample();
        another.directory = Some(temp.path().into());
        let request = submit(&another, "refused");
        assert!(another.receive(request, another.started).is_err());
        assert!(another.entries.is_empty());
        assert_eq!(another.bytes, 0);
        assert_eq!(
            std::fs::read_to_string(temp.path().join("proposal-inbox-v1.json")).unwrap(),
            "broken"
        );
    }
    #[test]
    fn restart_reconciles_only_a_matching_final_decision_without_requeue_or_new_capability() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path();
        let mut session = sample();
        session.directory = Some(directory.into());
        let request = submit(&session, "lost-ack");
        session.receive(request, session.started).unwrap();
        let session_id = session.id.clone();
        let token = session.token.clone();
        let proposal = session.entries[0].proposal.clone();
        let mut record = json!({"id":"final","createdAt":"2026-10-25T00:00:00.000Z","updatedAt":"2026-10-25T00:00:00.000Z","state":"pending","delivery":{"sessionId":session_id,"id":"lost-ack"},"proposal":proposal});
        let write = |r: &Value| {
            std::fs::write(directory.join("proposal-journal-v2.json"),serde_json::to_vec(&json!({"format":"nexo-proposal-journal","version":2,"entries":[r],"evicted":0})).unwrap()).unwrap()
        };
        write(&record);
        session
            .resolve_persisted(directory, "lost-ack", "reviewing", Some("final"))
            .unwrap();
        drop(session);
        record["state"] = json!("applied");
        write(&record);
        let saved = durable::read(directory).unwrap().pop().unwrap();
        assert_eq!(saved.entry.state, "reviewing");
        let mut recovered = Session::new(saved.entry.proposal["base_model"].clone()).unwrap();
        assert_ne!(recovered.token, token);
        recovered.id = saved.session_id;
        recovered.entries = vec![saved.entry];
        recovered.directory = Some(directory.into());
        assert!(recovered
            .resolve_persisted(directory, "lost-ack", "applied", Some("wrong"))
            .is_err());
        recovered
            .resolve_persisted(directory, "lost-ack", "applied", Some("final"))
            .unwrap();
        let confirmed = durable::read(directory).unwrap().pop().unwrap();
        assert_eq!(confirmed.entry.state, "applied");
        assert_eq!(confirmed.entry.proposal, proposal);
        assert_eq!(confirmed.entry.decision_id.as_deref(), Some("final"));
        assert!(recovered
            .resolve_persisted(directory, "lost-ack", "reviewing", Some("final"))
            .is_err());
    }
    #[test]
    fn saved_inbox_never_evicts_unresolved_deliveries_and_closure_never_claims_application() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = sample();
        let p = proposal(&session);
        for n in 0..32 {
            durable::put(
                temp.path(),
                &format!("s{n}"),
                &Entry {
                    id: "delivery".into(),
                    proposal: p.clone(),
                    state: "queued".into(),
                    decision_id: None,
                },
            )
            .unwrap();
        }
        let before = std::fs::read(temp.path().join("proposal-inbox-v1.json")).unwrap();
        let request = submit(&session, "new");
        session.directory = Some(temp.path().into());
        assert!(session.receive(request, session.started).is_err());
        assert!(session.entries.is_empty());
        assert_eq!(
            std::fs::read(temp.path().join("proposal-inbox-v1.json")).unwrap(),
            before
        );
        session.directory = None;
        let request = submit(&session, "recover");
        session.receive(request, session.started).unwrap();
        session.entries[0].state = "reviewing".into();
        session.entries[0].decision_id = Some("decision".into());
        let record = json!({"id":"decision","createdAt":"2026-10-25T00:00:00.000Z","updatedAt":"2026-10-25T00:00:00.000Z","state":"unconfirmed","delivery":{"sessionId":session.id,"id":"recover"},"proposal":p});
        std::fs::write(temp.path().join("proposal-journal-v2.json"),serde_json::to_vec(&json!({"format":"nexo-proposal-journal","version":2,"entries":[record],"evicted":0})).unwrap()).unwrap();
        assert_eq!(
            session
                .resolve_persisted(temp.path(), "recover", "closed", Some("decision"))
                .unwrap()["state"],
            "closed"
        );
        assert!(session
            .resolve_persisted(temp.path(), "recover", "applied", Some("decision"))
            .is_err());
    }
    fn proposal(s: &Session) -> Value {
        let mut candidate = s.base.clone();
        candidate["title"] = json!("Candidate");
        json!({"format":"nexo-change-proposal","version":1,"project_id":"p","author":"Synthetic","reason":"Test","base_revision":"a".repeat(64),"target_revision":"b".repeat(64),"base_model":s.base,"candidate_model":candidate})
    }
    fn submit(s: &Session, id: &str) -> Value {
        json!({"operation":"submit","id":id,"token":s.token,"proposal":proposal(s)})
    }
    #[test]
    fn authorization_full_base_expiry_and_duplicate_ids() {
        let mut s = sample();
        let mut r = submit(&s, "a");
        r["token"] = json!("wrong");
        assert!(s.receive(r, s.started).is_err());
        assert!(s.entries.is_empty());
        let r = submit(&s, "a");
        assert_eq!(s.receive(r.clone(), s.started).unwrap()["state"], "queued");
        s.receive(r.clone(), s.started).unwrap();
        assert_eq!(s.entries.len(), 1);
        let mut changed = r.clone();
        changed["proposal"]["candidate_model"]["title"] = json!("Different");
        assert!(s.receive(changed, s.started).is_err());
        let mut stale = submit(&s, "b");
        stale["proposal"]["base_model"]["title"] = json!("Stale");
        assert!(s.receive(stale, s.started).is_err());
        assert!(s.receive(r, s.started + TTL).is_err());
    }
    #[test]
    fn numeric_transport_spelling_does_not_change_finite_float_model_content() {
        assert!(same_content(
            &json!({"value":100.0,"args":[1.0,2.0]}),
            &json!({"args":[1,2],"value":100})
        ));
        assert!(!same_content(&json!([1, 2]), &json!([2, 1])));
        assert!(!same_content(
            &json!({"value":100}),
            &json!({"value":"100"})
        ));
        assert!(!same_content(
            &json!({"value":100}),
            &json!({"value":100.001})
        ));
    }
    #[test]
    fn durable_decision_must_match_delivery_session_content_and_phase() {
        let mut s = sample();
        let request = submit(&s, "wire");
        let p = request["proposal"].clone();
        s.receive(request, s.started).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("proposal-journal-v2.json");
        let mut record = json!({"id":"decisionA","createdAt":"2026-10-24T10:00:00.000Z","updatedAt":"2026-10-24T10:00:00.000Z","state":"pending","proposal":p,"delivery":{"sessionId":s.id,"id":"wrong"}});
        let write = |record: &Value| {
            std::fs::write(&path,serde_json::to_vec(&json!({"format":"nexo-proposal-journal","version":2,"evicted":0,"entries":[record]})).unwrap()).unwrap();
        };
        assert!(s
            .resolve_persisted(temp.path(), "wire", "reviewing", None)
            .is_err());
        write(&record);
        assert!(s
            .resolve_persisted(temp.path(), "wire", "reviewing", Some("decisionA"))
            .is_err());
        record["delivery"]["id"] = json!("wire");
        write(&record);
        assert_eq!(
            s.resolve_persisted(temp.path(), "wire", "reviewing", Some("decisionA"))
                .unwrap()["decision_id"],
            "decisionA"
        );
        assert!(s
            .resolve_persisted(temp.path(), "wire", "applied", Some("decisionA"))
            .is_err());
        record["state"] = json!("applied");
        record["proposal"]["candidate_model"]["title"] = json!("Forged");
        write(&record);
        assert!(s
            .resolve_persisted(temp.path(), "wire", "applied", Some("decisionA"))
            .is_err());
        record["proposal"] = s.entries[0].proposal.clone();
        write(&record);
        let receipt = s
            .resolve_persisted(temp.path(), "wire", "applied", Some("decisionA"))
            .unwrap();
        assert_eq!(receipt["state"], "applied");
        assert_eq!(receipt["decision_id"], "decisionA");
        assert_eq!(
            s.resolve_persisted(temp.path(), "wire", "applied", Some("decisionA"))
                .unwrap(),
            receipt
        );
        assert!(s
            .resolve_persisted(temp.path(), "wire", "applied", Some("decisionB"))
            .is_err());
        let query = json!({"operation":"status","id":"wire","token":s.token});
        assert_eq!(s.receive(query, s.started).unwrap(), receipt);
    }
    #[test]
    fn corrupt_confirmation_is_not_approval_and_uncertainty_keeps_verified_link() {
        let mut s = sample();
        let r = submit(&s, "wire");
        let p = r["proposal"].clone();
        s.receive(r, s.started).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("proposal-journal-v2.json");
        let record = json!({"id":"decision","createdAt":"2026-10-24T10:00:00.000Z","updatedAt":"2026-10-24T10:00:00.000Z","state":"pending","proposal":p,"delivery":{"sessionId":s.id,"id":"wire"}});
        std::fs::write(&path,serde_json::to_vec(&json!({"format":"nexo-proposal-journal","version":2,"evicted":0,"entries":[record]})).unwrap()).unwrap();
        s.resolve_persisted(temp.path(), "wire", "reviewing", Some("decision"))
            .unwrap();
        std::fs::write(&path, "broken").unwrap();
        assert!(s
            .resolve_persisted(temp.path(), "wire", "applied", Some("decision"))
            .is_err());
        assert_eq!(s.entries[0].state, "reviewing");
        let receipt = s
            .resolve_persisted(temp.path(), "wire", "unconfirmed", Some("decision"))
            .unwrap();
        assert_eq!(receipt["state"], "unconfirmed");
        assert_eq!(receipt["decision_id"], "decision");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "broken");
    }
    #[test]
    fn queue_never_evicts_pending_deliveries_and_receipts_are_bounded() {
        let mut s = sample();
        for n in 0..8 {
            let r = submit(&s, &format!("q{n}"));
            s.receive(r, s.started).unwrap();
        }
        let r = submit(&s, "full");
        assert!(s.receive(r, s.started).is_err());
        assert_eq!(s.entries.len(), 8);
        for n in 8..32 {
            s.entries
                .iter_mut()
                .for_each(|e| e.state = "rejected".into());
            let r = submit(&s, &format!("q{n}"));
            s.receive(r, s.started).unwrap();
        }
        s.entries
            .iter_mut()
            .for_each(|e| e.state = "rejected".into());
        let r = submit(&s, "full");
        assert!(s.receive(r, s.started).is_err());
    }
    #[test]
    fn byte_budget_ui_loss_and_terminal_decisions_are_explicit() {
        let mut s = sample();
        for n in 0..3 {
            let mut r = submit(&s, &format!("large{n}"));
            r["proposal"]["candidate_model"]["description"] = json!("x".repeat(590_000));
            s.receive(r, s.started).unwrap();
            s.resolve(&format!("large{n}"), "rejected").unwrap();
        }
        let mut r = submit(&s, "over");
        r["proposal"]["candidate_model"]["description"] = json!("x".repeat(590_000));
        assert!(s.receive(r, s.started).is_err());
        assert_eq!(s.entries.len(), 3);
        let r = submit(&s, "lost_ui");
        assert!(s.receive(r, s.last_seen + UI_LEASE).is_err());
        let mut s = sample();
        let r = submit(&s, "decision");
        s.receive(r, s.started).unwrap();
        assert!(s.resolve("decision", "applied").is_err());
        s.resolve("decision", "reviewing").unwrap();
        let retried = submit(&s, "decision");
        assert_eq!(s.receive(retried, s.started).unwrap()["state"], "reviewing");
        s.resolve("decision", "unconfirmed").unwrap();
        s.resolve("decision", "applied").unwrap();
        s.resolve("decision", "applied").unwrap();
        assert!(s.resolve("decision", "rejected").is_err());
        assert!(s.resolve("decision", "queued").is_err());
    }
    #[cfg(windows)]
    #[tokio::test]
    async fn local_pipe_accepts_json_and_refuses_unknown_capability() {
        use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
        let s = sample();
        let id = s.id.clone();
        let name = s.pipe.clone();
        let request = submit(&s, "wire");
        let files = ProposalSessions(Arc::new(Mutex::new(Some(s))));
        let listener = pipe(&name, true).unwrap();
        let task = tokio::spawn(serve(listener, files.clone(), id, name.clone()));
        for good in [false, true, true] {
            let mut client = tokio::net::windows::named_pipe::ClientOptions::new()
                .open(format!(r"\\.\pipe\{name}"))
                .unwrap();
            let mut r = request.clone();
            if !good {
                r["token"] = json!("wrong");
            }
            let mut bytes = serde_json::to_vec(&r).unwrap();
            bytes.push(b'\n');
            client.write_all(&bytes).await.unwrap();
            let mut line = String::new();
            tokio::time::timeout(
                Duration::from_secs(5),
                BufReader::new(client).read_line(&mut line),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(serde_json::from_str::<Value>(&line).unwrap()["ok"], good);
        }
        assert_eq!(files.0.lock().unwrap().as_ref().unwrap().entries.len(), 1);
        *files.0.lock().unwrap() = None;
        tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
    }
}
