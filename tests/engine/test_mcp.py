import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

pytest.importorskip("mcp", reason="Optional MCP extra is not installed")

import anyio  # noqa: E402
import jsonschema  # noqa: E402
from knowledge_engine.connector import Session, revision  # noqa: E402
from knowledge_engine.examples import load_example  # noqa: E402
from knowledge_engine.mcp_server import MAX_MCP_LINE, Adapter, tool_definitions  # noqa: E402
from mcp import ClientSession, StdioServerParameters  # noqa: E402
from mcp.client.stdio import stdio_client  # noqa: E402

ROOT = str(Path(__file__).resolve().parents[2] / "services" / "engine")
BOOTSTRAP = (
    "import sys;sys.path.insert(0,sys.argv[1]);from knowledge_engine.mcp_server import main;main()"
)


def scope(snapshot):
    return {
        "session_id": snapshot["session_id"],
        "project_id": snapshot["project_id"],
        "expected_revision": snapshot["revision"],
    }


def test_discoverable_schemas_are_valid_and_transport_fields_are_not_user_arguments():
    tools = tool_definitions()
    assert len(tools) == 10
    for tool in tools:
        jsonschema.Draft202012Validator.check_schema(tool.inputSchema)
        assert not {"operation", "protocol_version", "id"} & tool.inputSchema["properties"].keys()
        assert tool.inputSchema["additionalProperties"] is False
    assert next(t for t in tools if t.name == "nexo_analyze").annotations.readOnlyHint is False


def test_real_sdk_stdio_initialization_tools_analysis_conflict_and_evidence():
    async def scenario():
        params = StdioServerParameters(command=sys.executable, args=["-I", "-c", BOOTSTRAP, ROOT])
        async with stdio_client(params) as (read, write), ClientSession(read, write) as client:
            initialized = await client.initialize()
            assert initialized.serverInfo.name == "nexo-local"
            assert initialized.capabilities.tools is not None
            tools = await client.list_tools()
            assert len(tools.tools) == 10
            create = await client.call_tool(
                "nexo_create_project", {"model": load_example("complete").model_dump()}
            )
            assert not create.isError
            initial = create.structuredContent["data"]
            args = scope(initial)
            baseline = await client.call_tool("nexo_analyze", args)
            assert not baseline.isError
            first = baseline.structuredContent["data"]["run"]
            assert first["values"]["P_total"]["value"] == pytest.approx(2200)
            assert first["outcome"] == "consistent"
            assert json.loads(baseline.content[0].text) == baseline.structuredContent
            node = initial["model"]["variables"][0]
            node["value"] = 0.7
            changed = await client.call_tool(
                "nexo_apply_edits",
                {**args, "edits": [{"op": "node.put", "kind": "variable", "node": node}]},
            )
            assert not changed.isError
            stale = await client.call_tool(
                "nexo_apply_edits",
                {**args, "edits": [{"op": "project.rename", "title": "Do not overwrite"}]},
            )
            assert stale.isError and stale.structuredContent["error"]["code"] == "revision_conflict"
            args = scope(changed.structuredContent["data"])
            failed_model = await client.call_tool("nexo_analyze", args)
            assert not failed_model.isError  # Scientific attention is a completed analysis.
            assert failed_model.structuredContent["data"]["run"]["outcome"] == "attention"
            assert (
                failed_model.structuredContent["data"]["run"]["values"]["P_total"]["value"] == 2600
            )
            evidence = await client.call_tool(
                "nexo_get_evidence", {**args, "run_id": first["run_id"]}
            )
            assert evidence.structuredContent["data"]["record"]["run"] == first
            assert (
                evidence.structuredContent["data"]["record"]["model"]["variables"][0]["value"]
                == 0.5
            )
            rejected = await client.call_tool("nexo_get_project", {**args, "path": "private.py"})
            assert rejected.isError
            assert "private" not in str(rejected.structuredContent)
            # SDK supports concurrent calls; adapter serializes same-revision writers.
            writers = await asyncio.gather(
                *[
                    client.call_tool(
                        "nexo_apply_edits",
                        {**args, "edits": [{"op": "project.rename", "title": title}]},
                    )
                    for title in ("Writer A", "Writer B")
                ]
            )
            assert sorted(result.isError for result in writers) == [False, True]
            assert (
                next(r for r in writers if r.isError).structuredContent["error"]["code"]
                == "revision_conflict"
            )

    asyncio.run(scenario())


def test_canceled_candidate_is_not_committed(monkeypatch):
    # Synthetic slow transport operation, not a scientific or performance test.
    original = Session.dispatch

    def slow_dispatch(self, request):
        time.sleep(0.1)
        return original(self, request)

    async def scenario():
        adapter = Adapter()
        adapter.session.model = load_example("complete")
        before = revision(adapter.session.model)
        args = {
            "session_id": adapter.session.session_id,
            "project_id": adapter.session.model.id,
            "expected_revision": before,
            "edits": [{"op": "project.rename", "title": "Canceled candidate"}],
        }
        monkeypatch.setattr(Session, "dispatch", slow_dispatch)
        with anyio.move_on_after(0.02) as cancellation:
            await adapter.call("nexo_apply_edits", args)
        assert cancellation.cancel_called
        assert revision(adapter.session.model) == before
        assert adapter.session.history == []

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "raw", [b"secret-malformed-json\n", b"x" * (MAX_MCP_LINE + 1)], ids=["malformed", "oversized"]
)
def test_malformed_or_oversized_mcp_input_closes_without_echoing_payload(raw):
    result = subprocess.run(
        [sys.executable, "-I", "-c", BOOTSTRAP, ROOT], input=raw, capture_output=True, timeout=20
    )
    assert result.returncode == 2
    assert result.stdout == b""
    assert b"secret" not in result.stderr
    assert b"Traceback" not in result.stderr


def test_unknown_tool_transport_override_and_size_errors_remain_tool_errors():
    async def scenario():
        adapter = Adapter()
        for name, args, code in [
            ("invented", {}, "unknown_tool"),
            ("nexo_describe", {"operation": "analyze"}, "invalid_request"),
            ("nexo_describe", {"secret": "x" * 256001}, "too_large"),
        ]:
            result = await adapter.call(name, args)
            assert result.isError and result.structuredContent["error"]["code"] == code
            assert "secret" not in str(result.structuredContent)
        assert adapter.session.model is None

    asyncio.run(scenario())
