import subprocess
import sys
from pathlib import Path

import pytest
from knowledge_engine.worker import WorkerFailure, _capture


def worker(code, payload=b"", timeout=3, stdout=1024, stderr=1024):
    # Only test-authored fixtures are executable; never model/project-supplied code.
    return _capture(
        [sys.executable, "-I", "-c", code],
        str(Path(__file__).parent),
        payload,
        timeout,
        stdout,
        stderr,
    )


def test_exact_output_budget_is_allowed_without_dropping_bytes():
    assert worker("import sys;sys.stdout.buffer.write(b'x'*1024)") == b"x" * 1024


@pytest.mark.parametrize("stream", ["stdout", "stderr"])
def test_output_flood_is_stopped_and_direct_child_is_reaped(stream, monkeypatch):
    processes = []
    original = subprocess.Popen

    def capture_process(*args, **kwargs):
        process = original(*args, **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr("knowledge_engine.worker.subprocess.Popen", capture_process)
    with pytest.raises(WorkerFailure) as error:
        worker(
            f"import sys\nwhile True: sys.{stream}.buffer.write(b'x'*65536); "
            f"sys.{stream}.buffer.flush()"
        )
    assert error.value.code == "output_limit"
    assert len(processes) == 1 and processes[0].poll() is not None


def test_parallel_drain_accepts_both_streams_without_deadlock():
    result = worker(
        "import sys;sys.stderr.buffer.write(b'e'*500);sys.stdout.buffer.write(b'o'*500)"
    )
    assert result == b"o" * 500


def test_input_writer_cannot_block_timeout_when_child_never_reads():
    with pytest.raises(WorkerFailure) as error:
        worker("import time;time.sleep(60)", payload=b"x" * 250000, timeout=0.05)
    assert error.value.code == "timeout"


def test_exit_failure_is_not_approval_and_stderr_is_not_exposed():
    with pytest.raises(WorkerFailure) as error:
        worker("import sys;sys.stderr.write('private-fixture');sys.exit(1)")
    assert error.value.code == "engine_error"
    assert "private" not in str(error.value)


def test_missing_executable_remains_an_explicit_startup_failure():
    with pytest.raises(WorkerFailure) as error:
        _capture(["nonexistent-nexo-worker"], str(Path(__file__).parent), b"", 1, 1024, 1024)
    assert error.value.code == "engine_error"
