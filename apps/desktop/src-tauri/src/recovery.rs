use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Manager;

const LIMIT: u64 = 2_100_000;
#[derive(Clone, Default)]
pub struct RecoveryFiles(pub Arc<Mutex<()>>);

fn validate(content: &str) -> Result<(), String> {
    if content.len() as u64 > LIMIT {
        return Err("Cópia de recuperação excede o limite.".into());
    }
    let data: serde_json::Value =
        serde_json::from_str(content).map_err(|_| "Cópia de recuperação inválida.")?;
    if data["format"] != "nexo-recovery"
        || data["version"] != 1
        || !data["capturedAt"].is_string()
        || data["project"]["format"] != "nexo-project"
        || data["project"]["version"] != 1
        || !data["project"]["model"].is_object()
        || !data["project"]["workspace"].is_object()
    {
        return Err("Cópia de recuperação inválida.".into());
    }
    Ok(())
}

fn storage(
    directory: &Path,
    action: &str,
    content: Option<&str>,
) -> Result<Option<String>, String> {
    let path = directory.join("recovery-v1.json");
    match action {
        "read" => {
            let file = match std::fs::File::open(&path) {
                Ok(file) => file,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err("Não foi possível ler a recuperação.".into()),
            };
            let mut bytes = Vec::new();
            file.take(LIMIT + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Falha ao ler recuperação.")?;
            if bytes.len() as u64 > LIMIT {
                return Err("Cópia de recuperação excede o limite.".into());
            }
            let text =
                String::from_utf8(bytes).map_err(|_| "Recuperação precisa estar em UTF-8.")?;
            validate(&text)?;
            Ok(Some(text))
        }
        "write" => {
            let text = content.ok_or("Cópia de recuperação ausente.")?;
            validate(text)?;
            std::fs::create_dir_all(directory)
                .map_err(|_| "Não foi possível preparar recuperação.")?;
            let mut temp = tempfile::NamedTempFile::new_in(directory)
                .map_err(|_| "Falha ao preparar recuperação.")?;
            temp.write_all(text.as_bytes())
                .map_err(|_| "Falha ao gravar recuperação.")?;
            temp.as_file()
                .sync_all()
                .map_err(|_| "Falha ao confirmar recuperação.")?;
            temp.persist(&path)
                .map_err(|_| "Falha ao substituir recuperação. Cópia anterior preservada.")?;
            Ok(None)
        }
        "clear" => match std::fs::remove_file(&path) {
            Ok(()) => Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err("Não foi possível descartar recuperação.".into()),
        },
        _ => Err("Operação de recuperação inválida.".into()),
    }
}

#[tauri::command]
pub async fn recovery_storage(
    window: tauri::Window,
    app: tauri::AppHandle,
    files: tauri::State<'_, RecoveryFiles>,
    action: String,
    content: Option<String>,
) -> Result<Option<String>, String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    // No caller-supplied path and no restoration of a previous file grant.
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Pasta de recuperação indisponível.")?;
    let gate = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = gate.0.lock().map_err(|_| "Recuperação indisponível.")?;
        storage(&directory, &action, content.as_deref())
    })
    .await
    .map_err(|_| "Falha na recuperação.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    const GOOD: &str = r#"{"format":"nexo-recovery","version":1,"capturedAt":"2026-10-24T07:00:00Z","project":{"format":"nexo-project","version":1,"model":{"title":"Análise térmica"},"workspace":{}}}"#;
    #[test]
    fn atomic_recovery_rejects_bad_writes_and_retains_corrupt_input() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("Recuperação");
        assert_eq!(storage(&folder, "read", None).unwrap(), None);
        storage(&folder, "write", Some(GOOD)).unwrap();
        assert_eq!(
            storage(&folder, "read", None).unwrap().as_deref(),
            Some(GOOD)
        );
        assert!(storage(&folder, "write", Some("bad")).is_err());
        assert_eq!(
            storage(&folder, "read", None).unwrap().as_deref(),
            Some(GOOD)
        );
        assert!(storage(&folder, "write", Some(&" ".repeat(LIMIT as usize + 1))).is_err());
        std::fs::write(folder.join("recovery-v1.json"), b"corrupt").unwrap();
        assert!(storage(&folder, "read", None).is_err());
        assert_eq!(
            std::fs::read(folder.join("recovery-v1.json")).unwrap(),
            b"corrupt"
        );
        storage(&folder, "clear", None).unwrap();
        assert_eq!(storage(&folder, "read", None).unwrap(), None);
    }
    #[test]
    fn failed_destination_does_not_touch_an_unrelated_original() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original.nexo");
        std::fs::write(&original, GOOD).unwrap();
        assert!(storage(&original, "write", Some(GOOD)).is_err());
        assert_eq!(std::fs::read_to_string(&original).unwrap(), GOOD);
        assert!(storage(root.path(), "../../other", None).is_err());
    }
}
