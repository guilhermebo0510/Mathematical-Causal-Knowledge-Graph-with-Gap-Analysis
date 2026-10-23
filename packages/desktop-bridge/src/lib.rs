//! Transport independent of GTK/WebView so it can be verified in a cloud runner.

use std::{path::Path, process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

pub async fn request(
    executable: &Path,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut bytes = serde_json::to_vec(&request).map_err(|_| "Requisição inválida.")?;
    if bytes.len() > 256_000 {
        return Err("Modelo excede o limite de tamanho.".into());
    }
    bytes.push(b'\n');
    let mut command = Command::new(executable);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let response = tokio::time::timeout(Duration::from_secs(15), async {
        let mut child = command
            .spawn()
            .map_err(|_| "Não foi possível iniciar o motor empacotado.")?;
        let mut stdin = child.stdin.take().ok_or("Entrada do motor indisponível.")?;
        stdin
            .write_all(&bytes)
            .await
            .map_err(|_| "Falha ao enviar modelo ao motor.")?;
        drop(stdin);
        let output = child
            .wait_with_output()
            .await
            .map_err(|_| "Falha ao receber resposta do motor.")?;
        if !output.status.success() || output.stdout.len() > 1_000_000 {
            return Err("Motor não concluiu a operação ou excedeu o limite de saída.");
        }
        serde_json::from_slice(&output.stdout).map_err(|_| "Resposta inválida do motor.")
    })
    .await
    .map_err(|_| "Tempo limite de 15 segundos excedido; a análise foi interrompida.")?;
    response.map_err(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn oversized_request_is_rejected_before_process_start() {
        let response = request(
            Path::new("must-not-run"),
            json!({"data": "x".repeat(256_001)}),
        )
        .await;
        assert!(response.unwrap_err().contains("tamanho"));
    }

    #[tokio::test]
    async fn missing_binary_is_an_error_not_a_successful_analysis() {
        assert!(
            request(Path::new("nonexistent-knowledge-engine"), json!({}))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn packaged_python_engine_round_trip() {
        let binary = std::env::var("KNOWLEDGE_ENGINE_BINARY").expect(
            "Set KNOWLEDGE_ENGINE_BINARY to the packaged engine; this test must not be skipped",
        );
        for (example, expected_power, expected_failures) in
            [("complete", 2200.0, 0), ("missing_air", 1000.0, 2)]
        {
            let loaded = request(Path::new(&binary), json!({
                "protocol_version": 1, "id": "load", "operation": "load_example", "example_id": example
            })).await.unwrap();
            assert_eq!(loaded["ok"], true);
            let run = request(Path::new(&binary), json!({
                "protocol_version": 1, "id": "analyze", "operation": "analyze", "model": loaded["data"]["model"]
            })).await.unwrap();
            assert_eq!(run["id"], "analyze");
            assert_eq!(run["ok"], true);
            assert_eq!(run["data"]["values"]["P_total"]["value"], expected_power);
            assert_eq!(run["data"]["counts"]["failed"], expected_failures);
        }
    }
}
