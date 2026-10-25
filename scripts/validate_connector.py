"""Build a synthetic arithmetic graph through public stdio operations, then plant a defect."""

import argparse
import json
from datetime import datetime
from pathlib import Path

from knowledge_engine.connector_client import ConnectorClient


def validate(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)  # Never overwrite another experiment.
    model = {
        "schema_version": 1,
        "id": "connector_arithmetic",
        "title": "Aritmética via conector",
        "description": "Controle sintético: (12,5 × 12,5) − 12,5 = 143,75. Não é prova formal.",
        "variables": [
            {
                "id": "x",
                "label": "Entrada",
                "unit": "1",
                "value": 12.5,
                "source": "Controle sintético fixo",
            }
        ],
        "equations": [],
        "assumptions": [],
        "requirements": [],
        "observations": [],
    }
    scope = {}

    with ConnectorClient() as client:

        def request(operation, **fields):
            response = client.request(
                operation, **(scope if operation != "project.create" else {}), **fields
            )
            if not response["ok"]:
                raise RuntimeError(response["error"]["code"])
            data = response["data"]
            if "session_id" in data:
                scope.update(
                    session_id=data["session_id"],
                    project_id=data["project_id"],
                    expected_revision=data["revision"],
                )
            return data

        request("project.create", model=model)
        stale_scope = dict(scope)
        equation = {
            "id": "formula",
            "label": "Quadrado menos entrada",
            "lhs": "y",
            "rhs": {
                "op": "sub",
                "args": [{"op": "mul", "args": [{"var": "x"}, {"var": "x"}]}, {"var": "x"}],
            },
            "source": "Definição sintética explícita",
            "assumption_ids": [],
        }
        observation = {
            "id": "reference",
            "label": "Referência aritmética",
            "variable_id": "y",
            "value": 143.75,
            "unit": "1",
            "tolerance": 0,
            "source": "Multiplicação e subtração independentes: 12.5*12.5-12.5",
        }
        edits = [
            {
                "op": "node.put",
                "kind": "variable",
                "node": {
                    "id": "y",
                    "label": "Resultado",
                    "unit": "1",
                    "value": None,
                    "source": "Saída da fórmula",
                },
            },
            {"op": "node.put", "kind": "equation", "node": equation},
            {
                "op": "node.put",
                "kind": "assumption",
                "node": {
                    "id": "scope",
                    "label": "Escalares sem dimensão",
                    "justification": "Controle numérico sintético",
                },
            },
            {
                "op": "node.put",
                "kind": "requirement",
                "node": {"id": "coverage", "label": "Incluir expressão", "equation_id": "formula"},
            },
            {"op": "node.put", "kind": "observation", "node": observation},
            {
                "op": "relation.set",
                "relation": "ASSUMPTION_FOR",
                "source": "scope",
                "target": "formula",
            },
            {
                "op": "relation.set",
                "relation": "REQUIRES",
                "source": "coverage",
                "target": "formula",
            },
            {
                "op": "relation.set",
                "relation": "VALIDATED_BY",
                "source": "y",
                "target": "reference",
            },
        ]
        valid = request("project.apply", edits=edits)
        assert len(valid["graph"]["nodes"]) == 6
        assert {e["relation"] for e in valid["graph"]["edges"]} == {
            "INPUT_TO",
            "PRODUCES",
            "ASSUMPTION_FOR",
            "REQUIRES",
            "VALIDATED_BY",
        }
        control = request("analyze")["run"]
        assert control["outcome"] == "consistent" and control["counts"]["failed"] == 0
        assert control["values"]["y"]["value"] == 12.5 * 12.5 - 12.5 == 143.75
        rejected = client.request(
            "project.apply", **stale_scope, edits=[{"op": "project.rename", "title": "Não aplicar"}]
        )
        assert rejected["error"]["code"] == "revision_conflict"
        observation["value"] = 143
        observation["source"] = "Referência sintética errada de propósito"
        defect = request(
            "project.apply", edits=[{"op": "node.put", "kind": "observation", "node": observation}]
        )
        failure = request("analyze")["run"]
        assert failure["outcome"] == "attention" and failure["counts"]["failed"] == 1
        assert any(
            c["rule_id"] == "residual" and c["status"] == "failed" for c in failure["checks"]
        )
        original_evidence = request("evidence.get", run_id=control["run_id"])
        assert original_evidence["record"]["model"]["observations"][0]["value"] == 143.75
        assert original_evidence["record"]["run"] == control
        for name, data in (
            ("valid.model.json", valid["model"]),
            ("known-defect.model.json", defect["model"]),
            ("valid.nexo-evidence.json", original_evidence),
            ("known-defect.nexo-evidence.json", request("evidence.get", run_id=failure["run_id"])),
        ):
            with (output / name).open("x", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
    summary = {
        "control": control["counts"],
        "known_defect": failure["counts"],
        "control_revision": control["model_revision"],
        "defect_revision": failure["model_revision"],
        "conflict_rejected": True,
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
        default=Path("build") / f"connector-{datetime.now():%Y%m%d-%H%M%S}",
    )
    args = parser.parse_args()
    print(json.dumps(validate(args.output_dir), ensure_ascii=True))
