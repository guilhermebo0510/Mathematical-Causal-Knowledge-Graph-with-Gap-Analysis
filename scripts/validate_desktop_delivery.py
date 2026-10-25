"""Local synthetic SDK -> Windows inbox test; never log the temporary connection code."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from knowledge_engine.examples import load_example
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def validate(args):
    connection = args.connection_file.read_text(encoding="utf-8").strip()
    output = args.output_dir
    output.mkdir(parents=True, exist_ok=False)
    base = load_example("complete").model_dump(mode="json")
    params = StdioServerParameters(
        command=sys.executable, args=["-m", "knowledge_engine.mcp_server"]
    )
    async with stdio_client(params) as (read, write), ClientSession(read, write) as client:
        await client.initialize()
        assert len((await client.list_tools()).tools) == 10

        async def call(name, arguments):
            result = await client.call_tool(name, arguments)
            assert not result.isError, result.structuredContent
            return result.structuredContent["data"]

        snapshot = await call("nexo_create_project", {"model": base})

        def scope():
            return {k: snapshot[k] for k in ("session_id", "project_id")} | {
                "expected_revision": snapshot["revision"]
            }

        control = (await call("nexo_analyze", scope()))["run"]
        assert control["counts"]["failed"] == 0
        observation = dict(
            base["observations"][0],
            value=2300,
            source="Referência sintética plantada: 2.300 W contra controle 2.200 W.",
        )
        snapshot = await call(
            "nexo_apply_edits",
            scope() | {"edits": [{"op": "node.put", "kind": "observation", "node": observation}]},
        )
        defect = (await call("nexo_analyze", scope()))["run"]
        assert defect["counts"]["failed"] == 1
        submit = scope() | {
            "base_model": base,
            "author": "SDK MCP — controle sintético",
            "reason": "Referência 2.300 W plantada para ensaiar revisão local.",
            "connection": connection,
            "delivery_id": args.delivery_id,
        }
        received = await call("nexo_submit_to_desktop", submit)
        assert received["state"] == "queued"
        assert await call("nexo_submit_to_desktop", submit) == received
        changed = await client.call_tool(
            "nexo_submit_to_desktop", submit | {"reason": "Outro conteúdo"}
        )
        assert changed.isError
        stale = json.loads(json.dumps(base))
        stale["variables"][0]["value"] = 99
        rejected = await client.call_tool(
            "nexo_submit_to_desktop",
            submit | {"delivery_id": args.delivery_id + "-stale", "base_model": stale},
        )
        assert rejected.isError
        report = {
            "delivery": received,
            "control": control["counts"],
            "defect": defect["counts"],
            "duplicate_kept_id": True,
            "changed_id_rejected": True,
            "stale_base_rejected": True,
        }
        (output / "delivery.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report), flush=True)
        if args.wait:
            for _ in range(300):
                status = await call(
                    "nexo_desktop_status",
                    {"connection": connection, "delivery_id": args.delivery_id},
                )
                if status["state"] not in {"queued", "reviewing"}:
                    if status["state"] in {"applied", "rejected"}:
                        assert status.get("decision_id"), "Missing persisted decision link"
                    (output / "decision.json").write_text(json.dumps(status), encoding="utf-8")
                    print(json.dumps(status), flush=True)
                    return
                await asyncio.sleep(1)
            raise TimeoutError("No local decision observed in 300 seconds")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection-file", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--delivery-id", default="native-sdk-synthetic")
    parser.add_argument("--wait", action="store_true")
    asyncio.run(validate(parser.parse_args()))
