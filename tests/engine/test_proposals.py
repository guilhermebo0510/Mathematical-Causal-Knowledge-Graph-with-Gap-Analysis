from knowledge_engine.connector import Session, revision
from knowledge_engine.examples import load_example


def test_proposal_export_preserves_explicit_base_and_current_candidate_without_mutating():
    session = Session()
    session.model = load_example("complete")
    base = session.model.model_dump()
    session.model.variables[0].value = 0.7
    before = revision(session.model)
    request = {
        "protocol_version": 1,
        "id": "p",
        "operation": "proposal.export",
        "session_id": session.session_id,
        "project_id": session.model.id,
        "expected_revision": before,
        "base_model": base,
        "author": "Synthetic test",
        "reason": "Known parameter change",
    }
    response = session.dispatch(request)
    assert response["ok"]
    proposal = response["data"]
    assert proposal["base_model"]["variables"][0]["value"] == 0.5
    assert proposal["candidate_model"]["variables"][0]["value"] == 0.7
    assert proposal["base_revision"] != proposal["target_revision"] == before
    assert revision(session.model) == before and session.history == []
    request["base_model"]["id"] = "other"
    assert session.dispatch(request)["error"]["code"] == "scope_mismatch"
