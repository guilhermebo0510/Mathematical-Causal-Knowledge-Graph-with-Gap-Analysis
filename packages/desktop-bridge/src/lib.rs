//! Transport independent of GTK/WebView so it can be verified in a cloud runner.

use std::{path::Path, process::Stdio, time::Duration};
use tokio::sync::oneshot;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
};
mod process_group;
use process_group::ProcessGroup;
pub const CANCELLED: &str = "NEXO_CANCELLED";
pub const TERMINATION_UNCONFIRMED: &str = "NEXO_TERMINATION_UNCONFIRMED";
const CPU_BUDGET_EXCEEDED: &str = "Motor atingiu o orçamento de CPU; resultado indisponível.";

fn check_user_budget(
    group: &ProcessGroup,
    result: Result<Vec<u8>, String>,
) -> Result<Vec<u8>, String> {
    if result
        .as_ref()
        .err()
        .is_some_and(|e| e == CANCELLED || e == TERMINATION_UNCONFIRMED)
    {
        return result;
    }
    // Exit codes alone are not reliable quota diagnostics. Query actual aggregate
    // job accounting, including after an otherwise successful late exit.
    if group.user_budget_exhausted()? {
        Err(CPU_BUDGET_EXCEEDED.into())
    } else {
        result
    }
}

async fn cancelled(signal: Option<oneshot::Receiver<()>>) {
    if let Some(receiver) = signal {
        if receiver.await.is_ok() {
            return;
        }
    }
    std::future::pending::<()>().await
}

const OUTPUT_LIMIT: usize = 1_000_000;
const STDERR_LIMIT: usize = 64_000;

async fn bounded_read<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
    retain: bool,
) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut total = 0;
    let mut buffer = [0_u8; 8192];
    loop {
        let remaining = (limit + 1 - total).min(buffer.len());
        let count = reader
            .read(&mut buffer[..remaining])
            .await
            .map_err(|_| "Falha ao receber resposta do motor.")?;
        if count == 0 {
            return Ok(output);
        }
        total += count;
        if total > limit {
            return Err("Motor excedeu o limite de saída.".into());
        }
        if retain {
            output.extend_from_slice(&buffer[..count]);
        }
    }
}

async fn stop_and_reap(child: &mut Child) -> Result<(), String> {
    if let Ok(Some(_)) = child.try_wait() {
        return Ok(());
    }
    // start_kill alone is not confirmation; always await the direct child's exit.
    let _ = child.start_kill();
    tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .map_err(|_| TERMINATION_UNCONFIRMED)?
        .map_err(|_| TERMINATION_UNCONFIRMED)?;
    Ok(())
}

#[cfg(test)]
async fn exchange(
    child: &mut Child,
    bytes: &[u8],
    deadline: Duration,
    output_limit: usize,
    stderr_limit: usize,
) -> Result<Vec<u8>, String> {
    exchange_cancellable(child, bytes, deadline, output_limit, stderr_limit, None).await
}

async fn exchange_cancellable(
    child: &mut Child,
    bytes: &[u8],
    deadline: Duration,
    output_limit: usize,
    stderr_limit: usize,
    cancel: Option<oneshot::Receiver<()>>,
) -> Result<Vec<u8>, String> {
    let io = async {
        let mut stdin = child.stdin.take().ok_or("Entrada do motor indisponível.")?;
        let stdout = child.stdout.take().ok_or("Saída do motor indisponível.")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Diagnóstico do motor indisponível.")?;
        let write = async {
            stdin
                .write_all(bytes)
                .await
                .map_err(|_| "Falha ao enviar modelo ao motor.")?;
            drop(stdin);
            Ok::<(), String>(())
        };
        let wait = async {
            child
                .wait()
                .await
                .map_err(|_| String::from("Falha ao aguardar o motor."))
        };
        // Drain both pipes while sending input: a full stdin must not prevent timeout/limits.
        let (_, output, _, status) = tokio::try_join!(
            write,
            bounded_read(stdout, output_limit, true),
            bounded_read(stderr, stderr_limit, false),
            wait
        )?;
        if !status.success() {
            return Err("Motor não concluiu a operação.".into());
        }
        Ok(output)
    };
    let result = tokio::time::timeout(deadline, async {
        tokio::select! {
            biased;
            _ = cancelled(cancel) => Err(CANCELLED.into()),
            result = io => result,
        }
    })
    .await
    .unwrap_or_else(|_| Err("Tempo limite excedido; a análise foi interrompida.".into()));
    if let Err(error) = result {
        stop_and_reap(child).await?;
        return Err(error);
    }
    result
}

pub async fn request(
    executable: &Path,
    request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    request_impl(executable, request, None).await
}

pub async fn request_cancellable(
    executable: &Path,
    request: serde_json::Value,
    cancel: oneshot::Receiver<()>,
) -> Result<serde_json::Value, String> {
    request_impl(executable, request, Some(cancel)).await
}

async fn request_impl(
    executable: &Path,
    request: serde_json::Value,
    mut cancel: Option<oneshot::Receiver<()>>,
) -> Result<serde_json::Value, String> {
    let mut bytes = serde_json::to_vec(&request).map_err(|_| "Requisição inválida.")?;
    if bytes.len() > 256_000 {
        return Err("Modelo excede o limite de tamanho.".into());
    }
    bytes.push(b'\n');
    if let Some(receiver) = cancel.as_mut() {
        match receiver.try_recv() {
            Ok(()) => return Err(CANCELLED.into()),
            Err(oneshot::error::TryRecvError::Closed) => cancel = None,
            Err(oneshot::error::TryRecvError::Empty) => (),
        }
    }
    let mut command = Command::new(executable);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let group = ProcessGroup::new()?;
    group.configure(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "Não foi possível iniciar o motor empacotado.")?;
    if let Err(error) = group.attach_and_resume(&child) {
        let _ = stop_and_reap(&mut child).await;
        group
            .terminate()
            .await
            .map_err(|_| TERMINATION_UNCONFIRMED)?;
        return Err(error);
    }
    let result = exchange_cancellable(
        &mut child,
        &bytes,
        Duration::from_secs(120),
        OUTPUT_LIMIT,
        STDERR_LIMIT,
        cancel,
    )
    .await;
    if result.is_err() {
        group
            .terminate()
            .await
            .map_err(|_| TERMINATION_UNCONFIRMED)?;
    } else {
        group
            .wait_empty()
            .await
            .map_err(|_| TERMINATION_UNCONFIRMED)?;
    }
    let output = check_user_budget(&group, result)?;
    serde_json::from_slice(&output).map_err(|_| String::from("Resposta inválida do motor."))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture_command(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "tests::worker_fixture",
                "--ignored",
                "--nocapture",
            ])
            .env("NEXO_BRIDGE_TEST_FIXTURE", mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        command
    }
    fn fixture(mode: &str) -> Child {
        fixture_command(mode).spawn().unwrap()
    }

    #[test]
    #[ignore = "Only invoked in an isolated test child"]
    fn worker_fixture() {
        use std::io::Write;
        match std::env::var("NEXO_BRIDGE_TEST_FIXTURE").as_deref() {
            Ok("stdout") => loop {
                if std::io::stdout().write_all(&[b'x'; 8192]).is_err() {
                    return;
                }
            },
            Ok("stderr") => loop {
                if std::io::stderr().write_all(&[b'e'; 8192]).is_err() {
                    return;
                }
            },
            Ok("sleep") => std::thread::sleep(Duration::from_secs(60)),
            #[cfg(windows)]
            Ok(mode @ ("memory" | "memory32")) => {
                use windows_sys::Win32::System::Memory::{
                    VirtualAlloc, VirtualFree, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE,
                };
                // The large probe exceeds the test job budget; memory32 probes the
                // shared remainder after the parent commits memory. Handle refusal
                // without exhausting the machine or aborting on OOM.
                let memory = unsafe {
                    VirtualAlloc(
                        std::ptr::null(),
                        (if mode == "memory32" { 32 } else { 128 }) * 1024 * 1024,
                        MEM_COMMIT | MEM_RESERVE,
                        PAGE_READWRITE,
                    )
                };
                if memory.is_null() {
                    std::io::stdout()
                        .write_all(b"NEXO_ALLOCATION_DENIED\n")
                        .unwrap();
                } else {
                    std::io::stdout()
                        .write_all(b"NEXO_ALLOCATION_ALLOWED\n")
                        .unwrap();
                    unsafe { VirtualFree(memory, 0, MEM_RELEASE) };
                }
            }
            #[cfg(windows)]
            Ok("memory_tree") => {
                use std::os::windows::process::CommandExt;
                use windows_sys::Win32::System::Memory::{
                    VirtualAlloc, VirtualFree, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE, PAGE_READWRITE,
                };
                let memory = unsafe {
                    VirtualAlloc(
                        std::ptr::null(),
                        40 * 1024 * 1024,
                        MEM_COMMIT | MEM_RESERVE,
                        PAGE_READWRITE,
                    )
                };
                assert!(
                    !memory.is_null(),
                    "Test parent needs 40 MiB within its 64 MiB job"
                );
                std::io::stdout()
                    .write_all(b"NEXO_PARENT_ALLOCATION_ALLOWED\n")
                    .unwrap();
                let status = std::process::Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "tests::worker_fixture",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("NEXO_BRIDGE_TEST_FIXTURE", "memory32")
                    .creation_flags(0x08000000)
                    .status()
                    .unwrap();
                unsafe { VirtualFree(memory, 0, MEM_RELEASE) };
                assert!(status.success());
            }
            Ok("cpu") => loop {
                std::hint::black_box(17_u64.wrapping_mul(31));
            },
            Ok("spawn_cpu") => {
                let mut command = std::process::Command::new(std::env::current_exe().unwrap());
                command
                    .args([
                        "--exact",
                        "tests::worker_fixture",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("NEXO_BRIDGE_TEST_FIXTURE", "cpu");
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x08000000);
                }
                let _grandchild = command.spawn().unwrap();
                loop {
                    std::hint::black_box(29_u64.wrapping_mul(37));
                }
            }
            Ok("spawn") => {
                let mut command = std::process::Command::new(std::env::current_exe().unwrap());
                command
                    .args([
                        "--exact",
                        "tests::worker_fixture",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("NEXO_BRIDGE_TEST_FIXTURE", "sleep");
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x08000000);
                }
                let _grandchild = command.spawn().unwrap();
                std::thread::sleep(Duration::from_secs(60));
            }
            Ok("exit") => std::process::exit(1),
            _ => (),
        }
    }

    #[tokio::test]
    async fn exact_boundary_is_preserved_and_one_extra_byte_is_rejected() {
        let bytes = vec![b'x'; 8192];
        assert_eq!(bounded_read(&bytes[..], 8192, true).await.unwrap(), bytes);
        assert!(bounded_read(&bytes[..], 8191, true)
            .await
            .unwrap_err()
            .contains("limite"));
        assert!(bounded_read(&bytes[..], 8192, false)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn stdout_flood_ends_with_error_and_reaped_direct_child() {
        let mut child = fixture("stdout");
        let result = exchange(&mut child, b"{}\n", Duration::from_secs(10), 1024, 1024).await;
        assert!(result.unwrap_err().contains("limite de saída"));
        assert!(child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn stderr_flood_ends_without_echoing_diagnostics() {
        let mut child = fixture("stderr");
        let result = exchange(&mut child, b"{}\n", Duration::from_secs(10), 1024, 1024).await;
        assert_eq!(result.unwrap_err(), "Motor excedeu o limite de saída.");
        assert!(child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn blocked_stdin_cannot_prevent_timeout_and_reaping() {
        let mut child = fixture("sleep");
        let result = exchange(
            &mut child,
            &vec![b'x'; 250000],
            Duration::from_millis(100),
            1024,
            1024,
        )
        .await;
        assert!(result.unwrap_err().contains("Tempo limite"));
        assert!(child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn failed_exit_is_not_a_successful_response() {
        let mut child = fixture("exit");
        assert!(
            exchange(&mut child, b"{}\n", Duration::from_secs(10), 1024, 1024)
                .await
                .is_err()
        );
        assert!(child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn cancelled_before_start_never_launches_an_executable() {
        let (sender, receiver) = oneshot::channel();
        sender.send(()).unwrap();
        let result = request_cancellable(Path::new("must-not-run"), json!({}), receiver).await;
        assert_eq!(result.unwrap_err(), CANCELLED);
    }

    #[tokio::test]
    async fn explicit_cancel_reaps_the_running_direct_child() {
        let mut child = fixture("sleep");
        let (sender, receiver) = oneshot::channel();
        let send = async {
            tokio::time::sleep(Duration::from_millis(100)).await;
            sender.send(()).unwrap();
        };
        let (result, _) = tokio::join!(
            exchange_cancellable(
                &mut child,
                b"{}\n",
                Duration::from_secs(10),
                1024,
                1024,
                Some(receiver)
            ),
            send
        );
        assert_eq!(result.unwrap_err(), CANCELLED);
        assert!(child.try_wait().unwrap().is_some());
    }

    #[tokio::test]
    async fn dropping_the_sender_is_not_a_cancellation_request() {
        let mut child = fixture("success");
        let (sender, receiver) = oneshot::channel();
        drop(sender);
        assert!(exchange_cancellable(
            &mut child,
            b"{}\n",
            Duration::from_secs(10),
            1024,
            1024,
            Some(receiver)
        )
        .await
        .is_ok());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_job_contains_descendants_before_resume_and_leaves_other_jobs_alone() {
        let group = ProcessGroup::new().unwrap();
        let mut command = fixture_command("spawn");
        group.configure(&mut command);
        let mut child = command.spawn().unwrap();
        group.attach_and_resume(&child).unwrap();
        tokio::time::timeout(Duration::from_secs(10), async {
            while group.active_processes().unwrap() < 2 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let mut unrelated = fixture("sleep");
        let (sender, receiver) = oneshot::channel();
        sender.send(()).unwrap();
        assert_eq!(
            exchange_cancellable(
                &mut child,
                b"{}\n",
                Duration::from_secs(10),
                1024,
                1024,
                Some(receiver)
            )
            .await
            .unwrap_err(),
            CANCELLED
        );
        group.terminate().await.unwrap();
        assert_eq!(group.active_processes().unwrap(), 0);
        assert!(child.try_wait().unwrap().is_some());
        assert!(unrelated.try_wait().unwrap().is_none());
        stop_and_reap(&mut unrelated).await.unwrap();
    }

    #[tokio::test]
    async fn oversized_request_is_rejected_before_process_start() {
        let response = request(
            Path::new("must-not-run"),
            json!({"data": "x".repeat(256_001)}),
        )
        .await;
        assert!(response.unwrap_err().contains("tamanho"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_memory_budget_refuses_commit_without_constraining_other_processes() {
        let group = ProcessGroup::test_budget(64 * 1024 * 1024, 30 * 10_000_000).unwrap();
        let mut command = fixture_command("memory");
        group.configure(&mut command);
        let mut child = command.spawn().unwrap();
        group.attach_and_resume(&child).unwrap();
        let output = exchange(&mut child, b"{}\n", Duration::from_secs(10), 4096, 4096)
            .await
            .unwrap();
        group.wait_empty().await.unwrap();
        assert!(String::from_utf8(output)
            .unwrap()
            .contains("NEXO_ALLOCATION_DENIED"));
        let mut unrelated = fixture("memory");
        let output = exchange(&mut unrelated, b"{}\n", Duration::from_secs(10), 4096, 4096)
            .await
            .unwrap();
        assert!(String::from_utf8(output)
            .unwrap()
            .contains("NEXO_ALLOCATION_ALLOWED"));
        assert_eq!(group.active_processes().unwrap(), 0);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_cpu_budget_ends_the_job_and_descendant_without_a_wall_timeout() {
        let group = ProcessGroup::test_budget(256 * 1024 * 1024, 10_000_000).unwrap();
        let mut command = fixture_command("spawn_cpu");
        group.configure(&mut command);
        let mut child = command.spawn().unwrap();
        group.attach_and_resume(&child).unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            while group.active_processes().unwrap() < 2 {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        let error = exchange(&mut child, b"{}\n", Duration::from_secs(15), 4096, 4096)
            .await
            .unwrap_err();
        group.wait_empty().await.unwrap();
        assert_eq!(
            check_user_budget(&group, Err(error)).unwrap_err(),
            CPU_BUDGET_EXCEEDED
        );
        assert!(group.user_time().unwrap() >= 10_000_000);
        assert_eq!(group.active_processes().unwrap(), 0);
        assert!(child.try_wait().unwrap().is_some());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_memory_budget_is_shared_by_parent_and_descendant() {
        let group = ProcessGroup::test_budget(64 * 1024 * 1024, 30 * 10_000_000).unwrap();
        let mut command = fixture_command("memory_tree");
        group.configure(&mut command);
        let mut child = command.spawn().unwrap();
        group.attach_and_resume(&child).unwrap();
        let output = exchange(&mut child, b"{}\n", Duration::from_secs(10), 4096, 4096)
            .await
            .unwrap();
        group.wait_empty().await.unwrap();
        let text = String::from_utf8(output).unwrap();
        assert!(text.contains("NEXO_PARENT_ALLOCATION_ALLOWED"));
        assert!(text.contains("NEXO_ALLOCATION_DENIED"));
        assert!(!text.contains("NEXO_ALLOCATION_ALLOWED\n"));
        assert_eq!(group.active_processes().unwrap(), 0);
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
        let (sender, receiver) = oneshot::channel();
        drop(sender);
        assert_eq!(
            request_cancellable(
                Path::new(&binary),
                json!({"protocol_version":1,"id":"closed_channel","operation":"list_examples"}),
                receiver
            )
            .await
            .unwrap()["ok"],
            true
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

    #[tokio::test]
    async fn packaged_engine_handles_schema_boundary_control_and_a_known_defect_with_budgets() {
        let binary = std::env::var("KNOWLEDGE_ENGINE_BINARY").expect("Set KNOWLEDGE_ENGINE_BINARY");
        let mut variables = Vec::new();
        for n in 0..50 {
            variables.push(json!({"id":format!("x{n}"),"label":format!("Synthetic input {n}"),"unit":"1","value":1,"source":"Synthetic control"}));
            variables.push(json!({"id":format!("y{n}"),"label":format!("Synthetic output {n}"),"unit":"1","value":null,"source":"Synthetic control"}));
        }
        let sum = json!({"var":null,"op":"add","args":(0..8).map(|n|json!({"var":format!("x{n}"),"op":null,"args":[]})).collect::<Vec<_>>()});
        let mut model = json!({
            "schema_version":1,"id":"bounded_synthetic_control","title":"Synthetic schema boundary","description":"240 entities, 950 expression terms. Independent expected value: (8 ones) * (8 ones) = 64. No empirical claim.",
            "variables":variables,
            "equations":(0..50).map(|n|json!({"id":format!("eq{n}"),"label":format!("Synthetic product {n}"),"lhs":format!("y{n}"),"rhs":{"var":null,"op":"mul","args":[sum.clone(),sum.clone()]},"assumption_ids":[format!("a{}",n%30)],"source":"Synthetic control"})).collect::<Vec<_>>(),
            "assumptions":(0..30).map(|n|json!({"id":format!("a{n}"),"label":"Synthetic assumption","justification":"Dimensionless arithmetic control, not an empirical model."})).collect::<Vec<_>>(),
            "requirements":(0..30).map(|n|json!({"id":format!("r{n}"),"label":"Synthetic coverage","equation_id":format!("eq{n}"),"exclusion_reason":null})).collect::<Vec<_>>(),
            "observations":(0..30).map(|n|json!({"id":format!("o{n}"),"label":"Synthetic reference","variable_id":format!("y{n}"),"value":64,"unit":"1","tolerance":0,"source":"Independent arithmetic: 8 * 8 = 64"})).collect::<Vec<_>>()
        });
        let loaded=request(Path::new(&binary),json!({"protocol_version":1,"id":"boundary_import","operation":"import_model","model":model})).await.unwrap();
        assert_eq!(loaded["ok"], true);
        assert_eq!(
            loaded["data"]["graph"]["nodes"].as_array().unwrap().len(),
            240
        );
        assert_eq!(
            loaded["data"]["graph"]["edges"].as_array().unwrap().len(),
            560
        );
        let run=request(Path::new(&binary),json!({"protocol_version":1,"id":"boundary_control","operation":"analyze","model":model})).await.unwrap();
        assert_eq!(run["ok"], true);
        assert_eq!(run["data"]["outcome"], "consistent");
        assert_eq!(run["data"]["values"]["y49"]["value"].as_f64(), Some(64.0));
        assert_eq!(run["data"]["counts"]["failed"], 0);
        assert_eq!(run["data"]["counts"]["inconclusive"], 0);
        model["observations"][0]["value"] = json!(65);
        let defect=request(Path::new(&binary),json!({"protocol_version":1,"id":"boundary_defect","operation":"analyze","model":model})).await.unwrap();
        assert_eq!(defect["ok"], true);
        assert_eq!(defect["data"]["outcome"], "attention");
        assert_eq!(defect["data"]["counts"]["failed"], 1);
        assert_eq!(
            defect["data"]["values"]["y49"]["value"].as_f64(),
            Some(64.0)
        );
        assert_ne!(
            defect["data"]["model_revision"],
            run["data"]["model_revision"]
        );
    }
}
