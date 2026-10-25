import json
import os
import subprocess
import sys
from copy import deepcopy

import pytest
from knowledge_engine.connector import MAX_REQUEST_BYTES, Fault, Session, analyze_isolated, revision
from knowledge_engine.examples import load_example


def call(session, operation, **fields):
    request = {"protocol_version": 1, "id": "test", "operation": operation}
    if operation not in {"describe", "project.create"} and session.model:
        request.update(
            session_id=session.session_id,
            project_id=session.model.id,
            expected_revision=revision(session.model),
        )
    return session.dispatch({**request, **fields})


def created():
    session = Session()
    assert call(session, "project.create", model=load_example("complete").model_dump())["ok"]
    return session


def test_discovery_exposes_contract_and_explicit_limits_without_project():
    response = call(Session(), "describe")
    assert response["data"]["scope"] == "isolated_process_session"
    assert "oneOf" in response["data"]["schema"]
    assert response["data"]["limits"]["runs"] == 20


def test_session_scope_and_revision_guard_leave_newer_edit_intact():
    session = created()
    old = revision(session.model)
    assert call(session, "project.apply", edits=[{"op": "project.rename", "title": "Novo"}])["ok"]
    stale = call(
        session,
        "project.apply",
        expected_revision=old,
        edits=[{"op": "project.rename", "title": "Perda"}],
    )
    assert stale["error"]["code"] == "revision_conflict"
    assert stale["current_revision"] == revision(session.model)
    assert session.model.title == "Novo"
    assert call(session, "project.get", session_id="another")["error"]["code"] == "scope_mismatch"
    assert call(session, "analyze", project_id="another")["error"]["code"] == "scope_mismatch"


def test_batch_is_atomic_and_never_changes_operator_implicitly():
    session = created()
    before = session.model.model_dump()
    response = call(
        session,
        "project.apply",
        edits=[
            {"op": "project.rename", "title": "Não aplicar"},
            {
                "op": "node.put",
                "kind": "variable",
                "node": {"id": "x", "label": "x", "unit": "1", "value": float("inf")},
            },
        ],
    )
    assert not response["ok"]
    assert session.model.model_dump() == before
    unsupported = call(
        session,
        "project.apply",
        edits=[{"op": "relation.set", "relation": "INPUT_TO", "source": "U", "target": "eq_wall"}],
    )
    assert not unsupported["ok"]
    assert session.model.model_dump() == before


def test_duplicate_identity_and_existing_project_are_not_overwritten():
    session = created()
    before = revision(session.model)
    response = call(
        session,
        "project.apply",
        edits=[
            {
                "op": "node.put",
                "kind": "assumption",
                "node": {"id": "U", "label": "Different kind", "justification": "Synthetic"},
            }
        ],
    )
    assert response["error"]["code"] == "duplicate_id"
    assert (
        call(session, "project.create", model=load_example("missing_air").model_dump())["error"][
            "code"
        ]
        == "project_exists"
    )
    assert revision(session.model) == before


def test_relations_validate_endpoint_types_and_preserve_math_ast():
    session = created()
    equation = session.model.equations[0]
    ast = deepcopy(equation.rhs.model_dump())
    assumption = session.model.assumptions[0].id
    assert call(
        session,
        "project.apply",
        edits=[
            {
                "op": "relation.set",
                "relation": "ASSUMPTION_FOR",
                "source": assumption,
                "target": equation.id,
                "enabled": False,
            }
        ],
    )["ok"]
    assert assumption not in session.model.equations[0].assumption_ids
    assert call(
        session,
        "project.apply",
        edits=[
            {
                "op": "relation.set",
                "relation": "ASSUMPTION_FOR",
                "source": assumption,
                "target": equation.id,
            }
        ],
    )["ok"]
    assert assumption in session.model.equations[0].assumption_ids
    assert session.model.equations[0].rhs.model_dump() == ast
    bad = call(
        session,
        "project.apply",
        edits=[
            {
                "op": "relation.set",
                "relation": "REQUIRES",
                "source": "U",
                "target": equation.id,
            }
        ],
    )
    assert bad["error"]["code"] == "invalid_relation"


def test_real_worker_evidence_remains_bound_to_original_revision_after_known_defect():
    session = created()
    baseline = call(session, "analyze")["data"]["run"]
    assert baseline["outcome"] == "consistent"
    assert baseline["values"]["P_total"]["value"] == pytest.approx(2200)
    changed = session.model.variables[0].model_dump()
    assert changed["id"] == "U"
    changed["value"] = 0.7
    changed["source"] = "Defeito sintético conhecido"
    assert call(
        session,
        "project.apply",
        edits=[
            {
                "op": "node.put",
                "kind": "variable",
                "node": changed,
            }
        ],
    )["ok"]
    defect = call(session, "analyze")["data"]["run"]
    assert defect["outcome"] == "attention"
    assert defect["values"]["P_total"]["value"] == pytest.approx(2600)
    assert defect["model_revision"] != baseline["model_revision"]
    evidence = call(session, "evidence.get", run_id=baseline["run_id"])["data"]
    assert evidence["format"] == "nexo-run-evidence"
    assert evidence["record"]["model"]["variables"][0]["value"] == 0.5
    assert evidence["record"]["run"] == baseline
    evidence["record"]["run"]["counts"]["failed"] = 99
    assert session.history[-1]["run"]["counts"]["failed"] == 0
    assert call(session, "evidence.get", run_id="invented")["error"]["code"] == "not_found"


def test_timeout_is_explicit_and_not_a_scientific_pass():
    with pytest.raises(Fault) as error:
        analyze_isolated(load_example("complete"), timeout=0.001)
    assert error.value.code == "timeout"


def test_failed_worker_never_adds_an_approved_history_record(monkeypatch):
    session = created()
    before = revision(session.model)

    def timeout(_):
        raise Fault("timeout", "Synthetic transport failure")

    monkeypatch.setattr("knowledge_engine.connector.analyze_isolated", timeout)
    assert call(session, "analyze")["error"]["code"] == "timeout"
    assert session.history == []
    assert revision(session.model) == before


def test_output_limit_propagates_without_archiving_a_run(monkeypatch):
    from knowledge_engine.worker import WorkerFailure

    session = created()

    def flooded(*_):
        raise WorkerFailure("output_limit")

    monkeypatch.setattr("knowledge_engine.connector.run_scientific_worker", flooded)
    result = call(session, "analyze")
    assert result["error"]["code"] == "output_limit"
    assert session.history == []


def test_disconnect_reference_does_not_accidentally_bind_an_existing_sentinel_name():
    session = created()
    observation = session.model.observations[0]
    response = call(
        session,
        "project.apply",
        edits=[
            {
                "op": "node.put",
                "kind": "variable",
                "node": {
                    "id": "unconnected_reference",
                    "label": "Existing identifier",
                    "unit": "W",
                },
            },
            {
                "op": "relation.set",
                "relation": "VALIDATED_BY",
                "source": observation.variable_id,
                "target": observation.id,
                "enabled": False,
            },
        ],
    )
    assert response["ok"]
    assert session.model.observations[0].variable_id == "unconnected_reference_1"
    assert not any(e["target"] == observation.id for e in response["data"]["graph"]["edges"])


def test_removed_input_is_a_scientific_defect_not_silently_removed_from_equation():
    session = created()
    assert call(session, "project.apply", edits=[{"op": "node.remove", "node_id": "U"}])["ok"]
    assert "U" in str(session.model.equations[0].rhs.model_dump())
    run = call(session, "analyze")["data"]["run"]
    assert run["outcome"] == "attention"
    assert any(c["status"] == "failed" and c["rule_id"] == "integrity" for c in run["checks"])


def test_unknown_fields_paths_and_code_are_rejected_without_echo():
    session = created()
    for fields in (
        {"path": "secret.py"},
        {"code": "print('secret')"},
        {"run": {"outcome": "consistent"}},
    ):
        result = call(session, "project.get", **fields)
        assert result["error"]["code"] == "invalid_request"
        assert "secret" not in json.dumps(result)


def test_stdio_handles_bad_json_unicode_and_terminates_on_oversized_line():
    requests = [
        b"not json\n",
        json.dumps(
            {
                "protocol_version": 1,
                "id": "unicode",
                "operation": "project.create",
                "model": load_example("complete").model_dump(),
            },
            ensure_ascii=False,
        ).encode()
        + b"\n",
        b" " * (MAX_REQUEST_BYTES + 1) + b"\n",
    ]
    proc = subprocess.run(
        [sys.executable, "-m", "knowledge_engine.connector"],
        input=b"".join(requests),
        capture_output=True,
        timeout=20,
        env=os.environ.copy(),
    )
    assert proc.returncode == 0, proc.stderr.decode(errors="replace")
    lines = [json.loads(line) for line in proc.stdout.splitlines()]
    assert len(lines) == 3
    assert lines[0]["error"]["code"] == "invalid_json"
    assert lines[1]["data"]["model"]["title"] == "Balanço térmico de uma sala"
    assert lines[2]["error"]["code"] == "too_large"
