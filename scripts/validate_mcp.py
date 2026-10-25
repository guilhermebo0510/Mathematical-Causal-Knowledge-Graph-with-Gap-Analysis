"""Exercise the optional MCP server with the official SDK and a synthetic resistive circuit."""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def validate(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)
    package_root = str(Path(__file__).resolve().parents[1] / "services" / "engine")
    bootstrap = (
        "import sys;sys.path.insert(0,sys.argv[1]);"
        "from knowledge_engine.mcp_server import main;main()"
    )
    params = StdioServerParameters(
        command=sys.executable, args=["-I", "-c", bootstrap, package_root]
    )
    scope = {}
    model = {
        "schema_version": 1,
        "id": "mcp_circuit",
        "title": "Circuito resistivo via MCP",
        "description": "Controle sintético estacionário: I=2 A, R=3 ohm, V=6 V, P=12 W.",
        "variables": [
            {
                "id": "I",
                "label": "Corrente",
                "unit": "A",
                "value": 2,
                "source": "Entrada sintética fixa",
            }
        ],
        "equations": [],
        "assumptions": [],
        "requirements": [],
        "observations": [],
    }
    async with stdio_client(params) as (read, write), ClientSession(read, write) as client:
        initialized = await client.initialize()
        assert initialized.serverInfo.name == "nexo-local"
        assert len((await client.list_tools()).tools) == 10

        async def call(name, **fields):
            response = await client.call_tool(name, {**scope, **fields})
            if response.isError:
                raise RuntimeError(response.structuredContent["error"]["code"])
            data = response.structuredContent["data"]
            if "session_id" in data:
                scope.update(
                    session_id=data["session_id"],
                    project_id=data["project_id"],
                    expected_revision=data["revision"],
                )
            return data

        await call("nexo_create_project", model=model)
        edits = []
        for id_, label, unit, value in (
            ("R", "Resistência", "ohm", 3),
            ("V", "Tensão", "V", None),
            ("P", "Potência", "W", None),
        ):
            edits.append(
                {
                    "op": "node.put",
                    "kind": "variable",
                    "node": {
                        "id": id_,
                        "label": label,
                        "unit": unit,
                        "value": value,
                        "source": "Controle sintético de circuito resistivo",
                    },
                }
            )
        for id_, lhs, inputs in (("ohm_law", "V", ("I", "R")), ("power_law", "P", ("V", "I"))):
            edits.append(
                {
                    "op": "node.put",
                    "kind": "equation",
                    "node": {
                        "id": id_,
                        "label": id_,
                        "lhs": lhs,
                        "rhs": {"op": "mul", "args": [{"var": v} for v in inputs]},
                        "source": "Modelo sintético de resistor ideal",
                        "assumption_ids": [],
                    },
                }
            )
        observation = {
            "id": "reference",
            "label": "Referência de potência",
            "variable_id": "P",
            "value": 12,
            "unit": "W",
            "tolerance": 0.1,
            "source": "Cálculo independente: (2 A)^2 * 3 ohm = 12 W",
        }
        edits.extend(
            [
                {
                    "op": "node.put",
                    "kind": "assumption",
                    "node": {
                        "id": "steady",
                        "label": "Resistor ideal estacionário",
                        "justification": "Controle sintético, sem efeito térmico",
                    },
                },
                {
                    "op": "node.put",
                    "kind": "requirement",
                    "node": {
                        "id": "coverage",
                        "label": "Incluir lei de Ohm",
                        "equation_id": "ohm_law",
                    },
                },
                {"op": "node.put", "kind": "observation", "node": observation},
                {
                    "op": "relation.set",
                    "relation": "ASSUMPTION_FOR",
                    "source": "steady",
                    "target": "ohm_law",
                },
                {
                    "op": "relation.set",
                    "relation": "ASSUMPTION_FOR",
                    "source": "steady",
                    "target": "power_law",
                },
            ]
        )
        valid = await call("nexo_apply_edits", edits=edits)
        assert len(valid["graph"]["nodes"]) == 9
        control = (await call("nexo_analyze"))["run"]
        assert control["outcome"] == "consistent" and control["counts"]["inconclusive"] == 0
        assert control["values"]["V"]["value"] == 6
        assert control["values"]["P"]["value"] == 2**2 * 3 == 12
        observation["value"] = 13
        observation["source"] = "Referência errada de propósito, controle sintético"
        defect = await call(
            "nexo_apply_edits",
            edits=[{"op": "node.put", "kind": "observation", "node": observation}],
        )
        failure = (await call("nexo_analyze"))["run"]
        assert failure["outcome"] == "attention" and failure["counts"]["failed"] == 1
        assert any(
            c["rule_id"] == "residual" and c["status"] == "failed" for c in failure["checks"]
        )
        evidence = await call("nexo_get_evidence", run_id=control["run_id"])
        assert evidence["record"]["run"] == control
        assert evidence["record"]["model"]["observations"][0]["value"] == 12
        for name, data in (
            ("valid.model.json", valid["model"]),
            ("known-defect.model.json", defect["model"]),
            ("valid.nexo-evidence.json", evidence),
            (
                "known-defect.proposal.json",
                await call(
                    "nexo_export_proposal",
                    base_model=valid["model"],
                    author="MCP synthetic client",
                    reason="Referência 13 W plantada para validar proposta e resíduo.",
                ),
            ),
            (
                "known-defect.nexo-evidence.json",
                await call("nexo_get_evidence", run_id=failure["run_id"]),
            ),
        ):
            with (output / name).open("x", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
    summary = {
        "transport": "MCP stdio / official SDK 1.28.1",
        "control": control["counts"],
        "known_defect": failure["counts"],
        "control_revision": control["model_revision"],
        "defect_revision": failure["model_revision"],
        "output": str(output.resolve()),
    }
    with (output / "summary.json").open("x", encoding="utf-8") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("build") / f"mcp-circuit-{datetime.now():%Y%m%d-%H%M%S}",
    )
    print(json.dumps(asyncio.run(validate(parser.parse_args().output_dir)), ensure_ascii=True))
