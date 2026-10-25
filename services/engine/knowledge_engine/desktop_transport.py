"""Optional Windows JSON pipe client. No generic file, shell, network or pickle API."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

FRAME_LIMIT = 620_000

REFUSALS = {
    "Conexão local não autorizada.": "desktop_unauthorized",
    "Sessão encerrada ou expirada.": "desktop_session_closed",
    "ID de entrega já utilizado com outro conteúdo.": "desktop_delivery_conflict",
    "Proposta inválida ou base diferente da conexão.": "desktop_base_conflict",
    "Fila ou retenção da sessão cheia. Reconecte após revisar as entregas.": "desktop_queue_full",
    "Entrega não encontrada.": "desktop_delivery_missing",
    "Proposta excede 600 KB.": "desktop_proposal_too_large",
}


class DesktopDeliveryError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def connection_info(code: str) -> dict:
    if not isinstance(code, str) or len(code) > 600:
        raise ValueError("Código de conexão inválido.")
    try:
        value = json.loads(code)
        if (
            set(value) != {"format", "version", "pipe", "token", "project_id"}
            or value["format"] != "nexo-local-session"
            or value["version"] != 1
            or not re.fullmatch(
                r"nexo-proposals-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["pipe"]
            )
            or not re.fullmatch(r"[a-f0-9]{32}", value["token"])
            or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,63}", value["project_id"])
        ):
            raise ValueError
    except (ValueError, TypeError, KeyError):
        raise ValueError("Código de conexão inválido.") from None
    return value


def exchange(code: str, delivery_id: str, proposal: dict | None = None) -> dict:
    connection = connection_info(code)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", delivery_id):
        raise ValueError("ID de entrega inválido.")
    if proposal is not None and proposal.get("project_id") != connection["project_id"]:
        raise ValueError("Projeto diferente da conexão.")
    if os.name != "nt" or getattr(sys, "frozen", False):
        raise ValueError("Conexão direta requer Python local no Windows.")
    payload = {"connection": connection, "id": delivery_id, "proposal": proposal}
    raw = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
    if len(raw) > FRAME_LIMIT:
        raise ValueError("Entrega excede o limite local.")
    # A separate fixed stdlib helper bounds blocking Windows file IO. subprocess.run
    # kills and waits on timeout; a cancelled SDK call cannot leave an IO thread blocked.
    try:
        result = subprocess.run(
            [sys.executable, "-I", str(Path(__file__).resolve())],
            input=raw,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if result.returncode or len(result.stdout) > 64_000:
            raise ValueError
        reply = json.loads(result.stdout)
        if not isinstance(reply, dict) or reply.get("ok") is not True:
            message = reply.get("error") if isinstance(reply, dict) else None
            if isinstance(message, str) and message in REFUSALS:
                raise DesktopDeliveryError(REFUSALS[message], message)
            raise DesktopDeliveryError(
                "desktop_delivery_unconfirmed",
                "Canal local indisponível; consulte ou repita o mesmo ID.",
            )
        data = reply["data"]
        if (
            not isinstance(data, dict)
            or set(data) - {"id", "state", "decision_id"}
            or data["id"] != delivery_id
            or data["state"]
            not in {
                "queued",
                "reviewing",
                "applied",
                "rejected",
                "conflict",
                "failed",
                "unconfirmed",
            "closed",
            }
        ):
            raise ValueError
        if "decision_id" in data and (
            not isinstance(data["decision_id"], str)
            or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", data["decision_id"])
        ):
            raise ValueError
        return {
            "id": delivery_id,
            "state": data["state"],
            **({"decision_id": data["decision_id"]} if "decision_id" in data else {}),
        }
    except subprocess.TimeoutExpired:
        raise ValueError("Canal local excedeu o prazo; consulte ou repita o mesmo ID.") from None
    except (OSError, KeyError, TypeError, json.JSONDecodeError):
        raise ValueError("Canal local indisponível; consulte ou repita o mesmo ID.") from None


def main() -> None:
    try:
        raw = sys.stdin.buffer.read(FRAME_LIMIT + 1)
        if len(raw) > FRAME_LIMIT or os.name != "nt":
            raise ValueError
        request = json.loads(raw)
        connection = connection_info(json.dumps(request["connection"]))
        delivery_id = request["id"]
        if not isinstance(delivery_id, str) or not re.fullmatch(
            r"[a-zA-Z0-9_-]{1,80}", delivery_id
        ):
            raise ValueError
        proposal = request.get("proposal")
        frame = {
            "operation": "status" if proposal is None else "submit",
            "id": delivery_id,
            "token": connection["token"],
        }
        if proposal is not None:
            if proposal.get("project_id") != connection["project_id"]:
                raise ValueError
            frame["proposal"] = proposal
        line = json.dumps(frame, ensure_ascii=False, allow_nan=False).encode() + b"\n"
        if len(line) > FRAME_LIMIT:
            raise ValueError
        # Literal local namespace plus validated UUID; caller cannot choose another
        # device, UNC host, filesystem path, executable, or IPC namespace.
        with open("\\\\.\\pipe\\" + connection["pipe"], "r+b", buffering=0) as pipe:
            remaining = memoryview(line)
            while remaining:
                count = pipe.write(remaining)
                if not count:
                    raise ValueError
                remaining = remaining[count:]
            reply = pipe.readline(64_001)
        if len(reply) > 64_000 or not reply.endswith(b"\n"):
            raise ValueError
        response = json.loads(reply)
        # ASCII-escaped JSON is valid UTF-8 even when the Windows console uses cp1252.
        sys.stdout.write(json.dumps(response, allow_nan=False))
    except Exception:
        # No paths, capability tokens or imported model text in diagnostics.
        sys.stdout.write(
            json.dumps({"ok": False, "error": "Canal local indisponível ou resposta inválida."})
        )


if __name__ == "__main__":
    main()
