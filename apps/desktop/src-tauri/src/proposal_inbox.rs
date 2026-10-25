// Data-only inbox. Capabilities and pipe names are never serialized.
use super::{valid_id, Entry};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    io::{Read, Write},
    path::Path,
};
const LIMIT: usize = 8_000_000;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Record {
    pub session_id: String,
    pub entry: Entry,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Inbox {
    format: String,
    version: u32,
    records: Vec<Record>,
}
fn invalid() -> String {
    "Fila persistida inválida; arquivo preservado.".into()
}
fn validate(records: &[Record]) -> Result<(), String> {
    if records.len() > 32 {
        return Err(invalid());
    }
    let mut ids = std::collections::HashSet::new();
    for r in records {
        if !valid_id(&r.session_id)
            || !valid_id(&r.entry.id)
            || !ids.insert((&r.session_id, &r.entry.id))
            || ![
                "queued",
                "reviewing",
                "applied",
                "rejected",
                "conflict",
                "failed",
                "unconfirmed",
                "closed",
            ]
            .contains(&r.entry.state.as_str())
            || r.entry
                .decision_id
                .as_deref()
                .is_some_and(|id| !valid_id(id))
        {
            return Err(invalid());
        }
        crate::proposal_journal::validate_entry(
            &json!({"id":"check","createdAt":"2026-10-25T00:00:00.000Z","updatedAt":"2026-10-25T00:00:00.000Z","state":"pending","proposal":r.entry.proposal}),
        )?;
    }
    Ok(())
}
pub(super) fn read(directory: &Path) -> Result<Vec<Record>, String> {
    let file = match std::fs::File::open(directory.join("proposal-inbox-v1.json")) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err(invalid()),
    };
    let mut bytes = vec![];
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() > LIMIT {
        return Err(invalid());
    }
    let inbox: Inbox = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if inbox.format != "nexo-proposal-inbox" || inbox.version != 1 {
        return Err(invalid());
    }
    validate(&inbox.records)?;
    Ok(inbox.records)
}
pub(super) fn put(directory: &Path, session_id: &str, entry: &Entry) -> Result<(), String> {
    let mut records = read(directory)?;
    if let Some(existing) = records
        .iter_mut()
        .find(|r| r.session_id == session_id && r.entry.id == entry.id)
    {
        if !super::same_content(&existing.entry.proposal, &entry.proposal) {
            return Err(invalid());
        }
        existing.entry = entry.clone();
    } else {
        records.push(Record {
            session_id: session_id.into(),
            entry: entry.clone(),
        });
    }
    let mut inbox = Inbox {
        format: "nexo-proposal-inbox".into(),
        version: 1,
        records,
    };
    while inbox.records.len() > 32
        || serde_json::to_vec(&inbox).map_err(|_| invalid())?.len() > LIMIT
    {
        let index = inbox
            .records
            .iter()
            .position(|r| {
                !["queued", "reviewing", "unconfirmed"].contains(&r.entry.state.as_str())
                    && !(r.session_id == session_id && r.entry.id == entry.id)
            })
            .ok_or("Fila persistida cheia. Revise as entregas pendentes.")?;
        inbox.records.remove(index);
    }
    validate(&inbox.records)?;
    std::fs::create_dir_all(directory).map_err(|_| invalid())?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|_| invalid())?;
    serde_json::to_writer(&mut temp, &inbox).map_err(|_| invalid())?;
    temp.flush().map_err(|_| invalid())?;
    temp.as_file().sync_all().map_err(|_| invalid())?;
    temp.persist(directory.join("proposal-inbox-v1.json"))
        .map_err(|_| "Falha ao gravar fila; arquivo anterior preservado.".to_string())?;
    Ok(())
}
