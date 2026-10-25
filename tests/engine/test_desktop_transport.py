import json
import subprocess
from types import SimpleNamespace

import pytest
from knowledge_engine.desktop_transport import connection_info, exchange


def code(**changes):
    return json.dumps(
        {
            "format": "nexo-local-session",
            "version": 1,
            "pipe": "nexo-proposals-12345678-1234-1234-1234-123456789abc",
            "token": "a" * 32,
            "project_id": "p",
            **changes,
        }
    )


def test_pipe_capability_never_selects_remote_host_file_device_or_executable():
    assert connection_info(code())["project_id"] == "p"
    for pipe in [
        r"\\server\pipe\other",
        r"C:\private.json",
        r"\\.\pipe\other",
        "nexo-proposals-../file",
    ]:
        with pytest.raises(ValueError):
            connection_info(code(pipe=pipe))
    with pytest.raises(ValueError):
        connection_info(code(path="private"))
    with pytest.raises(ValueError):
        connection_info(code(token="short"))
    with pytest.raises(ValueError):
        connection_info("[]")


@pytest.mark.skipif(__import__("os").name != "nt", reason="Windows client wrapper")
def test_fixed_helper_timeout_is_sanitized_and_bound_to_requested_delivery(monkeypatch):
    import knowledge_engine.desktop_transport as module

    observed = []

    def run(command, **kwargs):
        observed.append((command, kwargs))
        return SimpleNamespace(
            returncode=0, stdout=b'{"ok":true,"data":{"id":"delivery","state":"queued"}}'
        )

    monkeypatch.setattr(module.subprocess, "run", run)
    assert exchange(code(), "delivery")["state"] == "queued"
    command, kwargs = observed[0]
    assert command[1] == "-I" and command[2].endswith("desktop_transport.py")
    assert kwargs["timeout"] == 8 and kwargs["stderr"] == subprocess.DEVNULL
    with pytest.raises(ValueError):
        exchange(code(), "delivery", {"project_id": "other"})
    assert len(observed) == 1

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("fixed helper", 8)

    monkeypatch.setattr(module.subprocess, "run", timeout)
    with pytest.raises(ValueError, match="mesmo ID"):
        exchange(code(), "delivery")


def test_mcp_delivery_contract_rejects_transport_override_and_does_not_echo_secret():
    pytest.importorskip("mcp")
    import anyio
    from knowledge_engine.mcp_server import Adapter

    async def scenario():
        adapter = Adapter()
        reply = await adapter.call(
            "nexo_desktop_status",
            {"connection": code(), "delivery_id": "delivery", "operation": "analyze"},
        )
        assert reply.isError and "a" * 32 not in str(reply.structuredContent)
        reply = await adapter.call(
            "nexo_desktop_status",
            {"connection": code(), "delivery_id": "delivery", "path": "private"},
        )
        assert reply.isError and "a" * 32 not in str(reply.structuredContent)
        assert "private" not in str(reply.structuredContent)

    anyio.run(scenario)


def test_fixed_helper_error_is_utf8_json_without_echoing_capability():
    import sys

    import knowledge_engine.desktop_transport as module

    payload = {"connection": connection_info(code()), "id": "missing", "proposal": None}
    result = subprocess.run(
        [sys.executable, "-I", module.__file__],
        input=json.dumps(payload).encode(),
        capture_output=True,
        timeout=10,
    )
    response = json.loads(result.stdout.decode("utf-8"))
    assert response["ok"] is False and "a" * 32 not in result.stdout.decode("utf-8")
    assert not result.stderr


@pytest.mark.skipif(__import__("os").name != "nt", reason="Windows client wrapper")
def test_only_allowlisted_refusals_are_exposed_to_mcp(monkeypatch):
    import knowledge_engine.desktop_transport as module

    message = "Fila ou retenção da sessão cheia. Reconecte após revisar as entregas."

    def reply(*args, **kwargs):
        return SimpleNamespace(
            returncode=0, stdout=json.dumps({"ok": False, "error": message}).encode()
        )

    monkeypatch.setattr(module.subprocess, "run", reply)
    with pytest.raises(module.DesktopDeliveryError) as error:
        exchange(code(), "delivery")
    assert error.value.code == "desktop_queue_full" and str(error.value) == message
    message = "unexpected private token " + "a" * 32
    with pytest.raises(module.DesktopDeliveryError) as error:
        exchange(code(), "delivery")
    assert "a" * 32 not in str(error.value) and error.value.code == "desktop_delivery_unconfirmed"


@pytest.mark.skipif(__import__("os").name != "nt", reason="Windows client wrapper")
def test_receipts_keep_only_valid_persisted_decision_ids(monkeypatch):
    import knowledge_engine.desktop_transport as module

    data = {"id": "delivery", "state": "applied", "decision_id": "decision-123"}

    def reply(*args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=json.dumps({"ok": True, "data": data}).encode())

    monkeypatch.setattr(module.subprocess, "run", reply)
    assert exchange(code(), "delivery") == data
    for bad in [
        dict(data, token="secret"),
        dict(data, decision_id="../file"),
        dict(data, decision_id=123),
    ]:
        data = bad
        with pytest.raises(ValueError):
            exchange(code(), "delivery")
