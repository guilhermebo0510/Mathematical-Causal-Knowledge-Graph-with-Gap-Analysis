use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MAX_PROJECT_BYTES: u64 = 2_000_000;

#[derive(Clone, Default)]
pub struct ProjectFiles(
    pub Arc<Mutex<Option<PathBuf>>>,
    pub Arc<Mutex<Option<PathBuf>>>,
);

fn check_window(window: &tauri::Window) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Janela sem permissão.".into());
    }
    Ok(())
}

fn read_bounded(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|_| "Não foi possível abrir o projeto.")?;
    let mut bytes = Vec::new();
    file.take(MAX_PROJECT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Não foi possível ler o projeto.")?;
    if bytes.len() as u64 > MAX_PROJECT_BYTES {
        return Err("Projeto excede 2 MB.".into());
    }
    String::from_utf8(bytes).map_err(|_| "O projeto precisa estar em UTF-8.".into())
}

fn write_project(path: &Path, content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_PROJECT_BYTES {
        return Err("Projeto excede 2 MB.".into());
    }
    let data: serde_json::Value = serde_json::from_str(content).map_err(|_| "JSON inválido.")?;
    if data["format"] != "nexo-project" || data["version"] != 1 {
        return Err("Formato de projeto inválido.".into());
    }
    let parent = path.parent().ok_or("Pasta de destino inválida.")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Não foi possível preparar o arquivo.")?;
    temp.write_all(content.as_bytes())
        .map_err(|_| "Não foi possível gravar o projeto.")?;
    temp.as_file()
        .sync_all()
        .map_err(|_| "Não foi possível confirmar a gravação.")?;
    temp.persist(path)
        .map_err(|_| "Não foi possível substituir o arquivo. O original foi preservado.")?;
    Ok(())
}

#[tauri::command]
pub async fn open_project_file(
    window: tauri::Window,
    files: tauri::State<'_, ProjectFiles>,
    language: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    check_window(&window)?;
    let state = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let english = language.as_deref() == Some("en");
        let path = rfd::FileDialog::new()
            .set_parent(&window)
            .set_title(if english {
                "Open Nexo project or JSON model"
            } else {
                "Abrir projeto Nexo ou modelo JSON"
            })
            .add_filter(
                if english {
                    "Nexo project (*.nexo, *.nexo.json, *.json)"
                } else {
                    "Projeto Nexo (*.nexo, *.nexo.json, *.json)"
                },
                &["nexo", "json"],
            )
            .pick_file();
        let Some(path) = path else {
            return Ok(None);
        };
        let content = read_bounded(&path)?;
        *state
            .1
            .lock()
            .map_err(|_| "Estado do arquivo indisponível.")? = Some(path.clone());
        Ok(Some(
            serde_json::json!({"path":path.to_string_lossy(),"content":content}),
        ))
    })
    .await
    .map_err(|_| "Não foi possível abrir o diálogo.".to_string())?
}

#[tauri::command]
pub async fn save_project_file(
    window: tauri::Window,
    files: tauri::State<'_, ProjectFiles>,
    content: String,
    name: String,
    save_as: bool,
    language: Option<String>,
) -> Result<Option<String>, String> {
    check_window(&window)?;
    let state = files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let english = language.as_deref() == Some("en");
        let existing = state
            .0
            .lock()
            .map_err(|_| "Estado do arquivo indisponível.")?
            .clone();
        let safe_name: String = name
            .chars()
            .filter(|c| c.is_alphanumeric() || "-_ ".contains(*c))
            .take(80)
            .collect();
        let path = if !save_as && existing.is_some() {
            existing
        } else {
            rfd::FileDialog::new()
                .set_parent(&window)
                .set_title(if english {
                    "Save Nexo project"
                } else {
                    "Salvar projeto Nexo"
                })
                .set_file_name(format!(
                    "{}.nexo",
                    if safe_name.is_empty() {
                        if english {
                            "project"
                        } else {
                            "projeto"
                        }
                    } else {
                        &safe_name
                    }
                ))
                .add_filter(
                    if english {
                        "Nexo project (*.nexo)"
                    } else {
                        "Projeto Nexo (*.nexo)"
                    },
                    &["nexo"],
                )
                .add_filter(
                    if english {
                        "JSON model (*.json)"
                    } else {
                        "Modelo JSON (*.json)"
                    },
                    &["json"],
                )
                .save_file()
        };
        let Some(path) = path else {
            return Ok(None);
        };
        write_project(&path, &content)?;
        *state
            .0
            .lock()
            .map_err(|_| "Estado do arquivo indisponível.")? = Some(path.clone());
        Ok(Some(path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|_| "Não foi possível salvar o projeto.".to_string())?
}

// The frontend acknowledges a validated project, without ever supplying a path.
#[tauri::command]
pub fn adopt_open_project(
    window: tauri::Window,
    files: tauri::State<'_, ProjectFiles>,
) -> Result<(), String> {
    check_window(&window)?;
    let path = files
        .1
        .lock()
        .map_err(|_| "Estado do arquivo indisponível.")?
        .take()
        .ok_or("Nenhum arquivo selecionado.")?;
    *files
        .0
        .lock()
        .map_err(|_| "Estado do arquivo indisponível.")? = Some(path);
    Ok(())
}

#[tauri::command]
pub fn forget_project_file(
    window: tauri::Window,
    files: tauri::State<'_, ProjectFiles>,
) -> Result<(), String> {
    check_window(&window)?;
    *files
        .0
        .lock()
        .map_err(|_| "Estado do arquivo indisponível.")? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_replaces_unicode_and_rejects_bad_input_without_truncating() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("Análise térmica.nexo.json");
        let first = r#"{"format":"nexo-project","version":1,"model":{"title":"Primeiro"}}"#;
        let second = r#"{"format":"nexo-project","version":1,"model":{"title":"Revisão"}}"#;
        write_project(&path, first).unwrap();
        write_project(&path, second).unwrap();
        assert_eq!(read_bounded(&path).unwrap(), second);
        assert!(write_project(&path, "inválido").is_err());
        assert_eq!(read_bounded(&path).unwrap(), second);
        std::fs::write(&path, vec![b' '; MAX_PROJECT_BYTES as usize + 1]).unwrap();
        assert!(read_bounded(&path).is_err());
    }
}
