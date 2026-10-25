"""Small reference client for the optional local authoring transport."""

import json
import queue
import subprocess
import sys
import threading
from pathlib import Path

from .connector import MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES


class ConnectorClient:
    def __init__(self):
        root = str(Path(__file__).resolve().parents[1])
        bootstrap = (
            "import sys;sys.path.insert(0,sys.argv[1]);"
            "from knowledge_engine.connector import main;main()"
        )
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        self.process = subprocess.Popen(
            [sys.executable, "-I", "-c", bootstrap, root],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=root,
            creationflags=flags,
        )
        self.responses = queue.Queue(maxsize=2)
        self.serial = 0
        self.closed = False

        def reader():
            while True:
                line = self.process.stdout.readline(MAX_RESPONSE_BYTES + 1)
                self.responses.put(line)
                if not line or len(line) > MAX_RESPONSE_BYTES:
                    return

        self.reader = threading.Thread(target=reader, daemon=True)
        self.reader.start()

    def request(self, operation: str, **fields) -> dict:
        if self.closed:
            raise RuntimeError("Conector encerrado.")
        self.serial += 1
        request_id = str(self.serial)
        raw = (
            json.dumps(
                {**fields, "protocol_version": 1, "id": request_id, "operation": operation},
                allow_nan=False,
            ).encode()
            + b"\n"
        )
        if len(raw) > MAX_REQUEST_BYTES:
            raise ValueError("Requisição excede 256 KB.")
        try:
            self.process.stdin.write(raw)
            self.process.stdin.flush()
            line = self.responses.get(timeout=25)
            if not line or len(line) > MAX_RESPONSE_BYTES:
                raise RuntimeError("Conector terminou ou excedeu o limite de resposta.")
            response = json.loads(line)
            if (
                not isinstance(response, dict)
                or response.get("id") != request_id
                or response.get("protocol_version") != 1
            ):
                raise RuntimeError("Resposta não corresponde à requisição.")
            return response
        except (OSError, ValueError, queue.Empty, RuntimeError):
            self.close()
            raise

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.process.stdin.close()
        except OSError:
            pass  # A broken pipe must not hide the original transport failure.
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.process.stdout.close()
        self.reader.join(timeout=1)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
