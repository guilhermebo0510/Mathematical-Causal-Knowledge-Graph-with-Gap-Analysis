import json
import os
import subprocess
import sys

import pytest
from knowledge_engine.examples import load_example
from knowledge_engine.protocol import dispatch
from knowledge_engine.schema import Model
from knowledge_engine.verification import verify
from pydantic import ValidationError


def test_complete_model_matches_independent_energy_balance():
    run = verify(load_example("complete"))
    assert run["outcome"] == "consistent"
    assert run["counts"]["failed"] == 0
    assert run["counts"]["inconclusive"] == 0
    assert run["values"]["P_wall"]["value"] == pytest.approx(1000)
    assert run["values"]["P_air"]["value"] == pytest.approx(1200)
    assert run["values"]["P_total"]["value"] == pytest.approx(2200)
    assert len(run["checks"]) >= 9


def test_omitted_air_is_coverage_gap_and_residual_not_discovery():
    run = verify(load_example("missing_air"))
    failures = [check for check in run["checks"] if check["status"] == "failed"]
    assert {check["rule_id"] for check in failures} == {"coverage", "residual"}
    assert run["values"]["P_total"]["value"] == pytest.approx(1000)
    assert "1200 W" in next(c for c in failures if c["rule_id"] == "residual")["evidence"]
    assert "não identifica causa única" in failures[-1]["suggested_action"]


def test_missing_input_blocks_downstream_and_observation_is_inconclusive():
    run = verify(load_example("missing_input"))
    assert "P_total" not in run["values"]
    assert any(
        c["rule_id"] == "dependencies" and "U" in c["node_ids"] and c["status"] == "failed"
        for c in run["checks"]
    )
    assert any(c["rule_id"] == "residual" and c["status"] == "inconclusive" for c in run["checks"])


def test_incompatible_area_cannot_produce_a_power_result():
    run = verify(load_example("invalid_unit"))
    assert "P_wall" not in run["values"]
    assert "P_total" not in run["values"]
    assert any(
        c["rule_id"] == "dimensions" and c["status"] == "failed" and "A" in c["node_ids"]
        for c in run["checks"]
    )


def test_unit_conversion_preserves_prediction():
    data = load_example("complete").model_dump()
    area = next(v for v in data["variables"] if v["id"] == "A")
    area.update(unit="cm ** 2", value=1_000_000)
    run = verify(Model.model_validate(data))
    assert run["values"]["P_total"]["value"] == pytest.approx(2200)
    assert run["outcome"] == "consistent"


def test_cycle_is_unsupported_not_a_scientific_contradiction():
    data = load_example("complete").model_dump()
    data["equations"][0]["rhs"] = {"var": "P_total"}
    run = verify(Model.model_validate(data))
    assert run["outcome"] == "inconclusive"
    assert any("cíclico" in c["title"] for c in run["checks"])
    assert not any(c["status"] == "failed" for c in run["checks"])


@pytest.mark.parametrize("mutation", ["duplicate", "broken_reference", "multiple_producers"])
def test_structural_defects_never_return_consistent(mutation):
    data = load_example("complete").model_dump()
    if mutation == "duplicate":
        data["variables"][1]["id"] = "U"
    elif mutation == "broken_reference":
        data["equations"][0]["rhs"] = {"var": "unknown"}
    else:
        data["equations"][1]["lhs"] = "P_wall"
    run = verify(Model.model_validate(data))
    assert run["outcome"] != "consistent"
    assert "P_total" not in run["values"]


def test_bad_observation_unit_is_inconclusive():
    data = load_example("complete").model_dump()
    data["observations"][0]["unit"] = "m"
    run = verify(Model.model_validate(data))
    assert run["outcome"] == "inconclusive"
    assert any(c["rule_id"] == "residual" and c["status"] == "inconclusive" for c in run["checks"])


def test_model_revision_is_reproducible_and_changes_with_input():
    first = verify(load_example("complete"))
    second = verify(load_example("complete"))
    changed = verify(load_example("missing_input"))
    assert first["model_revision"] == second["model_revision"]
    assert first["values"] == second["values"]
    assert first["run_id"] != second["run_id"]
    assert changed["model_revision"] != first["model_revision"]


@pytest.mark.parametrize(
    "rhs",
    [
        {"code": "__import__('os').system('echo unsafe')"},
        {"var": "__import__('os')"},
        {"op": "eval", "args": [{"var": "U"}, {"var": "A"}]},
    ],
)
def test_executable_expressions_are_rejected(rhs):
    data = load_example("complete").model_dump()
    data["equations"][0]["rhs"] = rhs
    with pytest.raises(ValidationError):
        Model.model_validate(data)


def test_excessive_expression_depth_is_rejected():
    data = load_example("complete").model_dump()
    rhs = {"var": "U"}
    for _ in range(15):
        rhs = {"op": "mul", "args": [rhs, {"var": "A"}]}
    data["equations"][0]["rhs"] = rhs
    with pytest.raises(ValidationError):
        Model.model_validate(data)


def test_extreme_unit_exponent_is_rejected():
    data = load_example("complete").model_dump()
    data["variables"][0]["unit"] = "m ** 999999999999999"
    with pytest.raises(ValidationError):
        Model.model_validate(data)


def test_protocol_errors_are_explicit_and_do_not_echo_private_payloads():
    response = dispatch(
        {
            "protocol_version": 1,
            "id": "private-check",
            "operation": "analyze",
            "model": {"private": "secret document content"},
        }
    )
    assert response["ok"] is False
    assert response["id"] == "private-check"
    assert "secret document content" not in json.dumps(response)


def test_import_with_duplicate_graph_ids_is_rejected_without_crashing_ui():
    data = load_example("complete").model_dump()
    data["variables"][1]["id"] = "U"
    response = dispatch(
        {"protocol_version": 1, "id": "duplicate", "operation": "import_model", "model": data}
    )
    assert response["ok"] is False


def test_graph_arrows_have_explicit_computational_direction():
    response = dispatch(
        {
            "protocol_version": 1,
            "id": "graph",
            "operation": "load_example",
            "example_id": "complete",
        }
    )
    edges = response["data"]["graph"]["edges"]
    assert any(
        edge["source"] == "U" and edge["target"] == "eq_wall" and edge["relation"] == "INPUT_TO"
        for edge in edges
    )
    assert any(
        edge["source"] == "eq_wall"
        and edge["target"] == "P_wall"
        and edge["relation"] == "PRODUCES"
        for edge in edges
    )


def test_json_lines_transport_keeps_stdout_machine_readable():
    lines = [
        {"protocol_version": 1, "id": "1", "operation": "list_examples"},
        {
            "protocol_version": 1,
            "id": "2",
            "operation": "analyze",
            "model": load_example("complete").model_dump(),
        },
    ]
    completed = subprocess.run(
        [sys.executable, "-m", "knowledge_engine.protocol"],
        input="\n".join(json.dumps(line) for line in lines) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
        timeout=15,
    )
    responses = [json.loads(line) for line in completed.stdout.splitlines()]
    assert [response["id"] for response in responses] == ["1", "2"]
    assert len(responses[0]["data"]) == 4
    assert responses[1]["data"]["values"]["P_total"]["value"] == pytest.approx(2200)


def test_protocol_enforces_utf8_even_with_legacy_windows_style_io_encoding():
    request = {"protocol_version": 1, "id": "encoding", "operation": "list_examples"}
    completed = subprocess.run(
        [sys.executable, "-m", "knowledge_engine.protocol"],
        input=(json.dumps(request) + "\n").encode(),
        capture_output=True,
        check=True,
        timeout=15,
        env={**os.environ, "PYTHONIOENCODING": "cp1252"},
    )
    response = json.loads(completed.stdout.decode("utf-8"))
    assert response["data"][2]["label"] == "Unidade incompatível"
