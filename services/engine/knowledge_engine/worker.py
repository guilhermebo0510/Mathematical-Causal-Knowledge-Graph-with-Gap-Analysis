"""Bounded capture for the trusted scientific worker, with explicit failure states."""

import subprocess
import sys
import threading
import time
from pathlib import Path


class WorkerFailure(Exception):
    def __init__(self, code: str):
        self.code = code


def _capture(
    command: list[str],
    cwd: str,
    payload: bytes,
    timeout: float,
    stdout_limit: int,
    stderr_limit: int,
) -> bytes:
    """Internal transport primitive; command/cwd never come from model or MCP input."""
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        child = subprocess.Popen(
            command,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=flags,
        )
    except OSError as exc:
        raise WorkerFailure("engine_error") from exc
    failure: list[str] = []
    fault_lock = threading.Lock()
    wake = threading.Event()
    output = bytearray()

    def fail(code: str):
        with fault_lock:
            if not failure:
                failure.append(code)
        wake.set()

    def read(pipe, limit: int, retain: bool):
        total = 0
        try:
            while data := pipe.read(min(65536, limit + 1 - total)):
                total += len(data)
                if total > limit:
                    fail("output_limit")
                    return
                if retain:
                    output.extend(data)
        except (OSError, ValueError, MemoryError):
            fail("engine_error")

    def write():
        try:
            child.stdin.write(payload)
            child.stdin.flush()
        except (BrokenPipeError, OSError):
            # A child can reject a request and close its input before draining it.
            pass
        finally:
            try:
                child.stdin.close()
            except OSError:
                pass

    threads = [
        threading.Thread(target=read, args=(child.stdout, stdout_limit, True), daemon=True),
        threading.Thread(target=read, args=(child.stderr, stderr_limit, False), daemon=True),
        threading.Thread(target=write, daemon=True),
    ]
    try:
        for thread in threads:
            thread.start()
        deadline = time.monotonic() + timeout
        while child.poll() is None:
            if failure:
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                fail("timeout")
                break
            wake.wait(min(0.05, remaining))
        if failure and child.poll() is None:
            child.kill()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired as exc:
            raise WorkerFailure("termination_error") from exc
        for thread in threads:
            thread.join(timeout=2)
        if any(thread.is_alive() for thread in threads):
            raise WorkerFailure("termination_error")
        if failure:
            raise WorkerFailure(failure[0])
        if child.returncode:
            raise WorkerFailure("engine_error")
        return bytes(output)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
        for thread in threads:
            if thread.ident is not None and thread.is_alive():
                thread.join(timeout=1)
        # Do not block on a buffered pipe lock held by an anomalous surviving reader.
        # The trusted worker has no descendants; a process tree is not managed here.
        if not any(thread.is_alive() for thread in threads):
            for pipe in (child.stdin, child.stdout, child.stderr):
                pipe.close()


def run_scientific_worker(payload: bytes, timeout: float = 20) -> bytes:
    root = str(Path(__file__).resolve().parents[1])
    bootstrap = (
        "import sys;sys.path.insert(0,sys.argv[1]);"
        "from knowledge_engine.protocol import main;main()"
    )
    return _capture(
        [sys.executable, "-I", "-c", bootstrap, root],
        root,
        payload,
        timeout,
        stdout_limit=4_000_000,
        stderr_limit=64_000,
    )
