"""Optional local JSON-lines authoring session. No network or project file access."""

import hashlib
import json
import sys
from copy import deepcopy
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field, TypeAdapter, ValidationError

from .protocol import MAX_REQUEST_BYTES
from .schema import (
    Assumption,
    Equation,
    Identifier,
    Model,
    Observation,
    Requirement,
    StrictModel,
    Text,
    Variable,
)
from .verification import project_graph
from .worker import WorkerFailure, run_scientific_worker

MAX_HISTORY_BYTES = 8_000_000
MAX_RESPONSE_BYTES = 4_000_000
KINDS = {
    "variable": ("variables", Variable),
    "equation": ("equations", Equation),
    "assumption": ("assumptions", Assumption),
    "requirement": ("requirements", Requirement),
    "observation": ("observations", Observation),
}


def revision(model: Model) -> str:
    # Same canonical form as the scientific verifier; not a scientific verdict.
    raw = json.dumps(model.model_dump(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


class Fault(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message


class Put(StrictModel):
    op: Literal["node.put"]
    kind: Literal["variable", "equation", "assumption", "requirement", "observation"]
    node: dict


class Remove(StrictModel):
    op: Literal["node.remove"]
    node_id: Identifier


class Rename(StrictModel):
    op: Literal["project.rename"]
    title: Text


class Relation(StrictModel):
    op: Literal["relation.set"]
    relation: Literal["ASSUMPTION_FOR", "REQUIRES", "VALIDATED_BY"]
    source: Identifier
    target: Identifier
    enabled: bool = True


Edit = Annotated[Put | Remove | Rename | Relation, Field(discriminator="op")]


class BaseRequest(StrictModel):
    protocol_version: Literal[1]
    id: str = Field(min_length=1, max_length=80)


class Describe(BaseRequest):
    operation: Literal["describe"]


class Create(BaseRequest):
    operation: Literal["project.create"]
    model: Model


class Scoped(BaseRequest):
    session_id: str = Field(min_length=1, max_length=80)
    project_id: Identifier
    expected_revision: str = Field(pattern="^[a-f0-9]{64}$")


class Snapshot(Scoped):
    operation: Literal["project.get", "project.export", "analyze"]


class Apply(Scoped):
    operation: Literal["project.apply"]
    edits: list[Edit] = Field(min_length=1, max_length=240)


class Evidence(Scoped):
    operation: Literal["evidence.get"]
    run_id: str = Field(min_length=1, max_length=80)


class ExportProposal(Scoped):
    operation: Literal["proposal.export"]
    base_model: Model
    author: Text
    reason: Text


Request = Annotated[
    Describe | Create | Snapshot | Apply | Evidence | ExportProposal,
    Field(discriminator="operation"),
]
ADAPTER = TypeAdapter(Request)


def analyze_isolated(model: Model, timeout: float = 20) -> dict:
    """Fixed trusted worker, isolated from cwd/PYTHONPATH, with a wall-clock limit."""
    request = {
        "protocol_version": 1,
        "id": "connector",
        "operation": "analyze",
        "model": model.model_dump(),
    }
    payload = json.dumps(request, ensure_ascii=False, allow_nan=False).encode() + b"\n"
    if len(payload) > MAX_REQUEST_BYTES:
        raise Fault("too_large", "Modelo excede o transporte científico de 256 KB.")
    try:
        output = run_scientific_worker(payload, timeout)
    except WorkerFailure as exc:
        messages = {
            "timeout": "O processo científico excedeu o prazo e foi encerrado.",
            "output_limit": "O processo científico excedeu o limite de saída e foi encerrado.",
            "termination_error": "Encerramento do processo científico não confirmado.",
        }
        raise Fault(exc.code, messages.get(exc.code, "Processo científico indisponível.")) from exc
    try:
        response = json.loads(output)
        if not response["ok"]:
            raise Fault("engine_error", "O motor recusou a análise; não há resultado aprovado.")
        run = response["data"]
        if run["model_revision"] != revision(model):
            raise Fault("engine_error", "Revisão da resposta científica não corresponde à entrada.")
        return run
    except (ValueError, KeyError, TypeError) as exc:
        raise Fault("engine_error", "Resposta científica inválida.") from exc


class Session:
    def __init__(self):
        self.session_id = str(uuid4())
        self.model: Model | None = None
        self.history: list[dict] = []
        self.evicted = 0

    def snapshot(self) -> dict:
        return {
            "session_id": self.session_id,
            "project_id": self.model.id,
            "revision": revision(self.model),
            "model": self.model.model_dump(),
            "graph": project_graph(self.model),
        }

    def guard(self, request: Scoped) -> None:
        if self.model is None:
            raise Fault("no_project", "Crie um projeto nesta sessão primeiro.")
        if request.session_id != self.session_id or request.project_id != self.model.id:
            raise Fault("scope_mismatch", "Sessão ou projeto não corresponde ao escopo solicitado.")
        if request.expected_revision != revision(self.model):
            raise Fault(
                "revision_conflict", "Revisão desatualizada; nenhuma alteração foi aplicada."
            )

    def edit(self, edits: list[Edit]) -> Model:
        data = self.model.model_dump()
        for edit in edits:
            if isinstance(edit, Rename):
                data["title"] = edit.title
            elif isinstance(edit, Put):
                collection, schema = KINDS[edit.kind]
                node = schema.model_validate(edit.node).model_dump()
                others = [
                    item for key, _ in KINDS.values() if key != collection for item in data[key]
                ]
                if any(item["id"] == node["id"] for item in others):
                    raise Fault(
                        "duplicate_id", "Identificador já usado por outro tipo de elemento."
                    )
                items = data[collection]
                index = next((i for i, item in enumerate(items) if item["id"] == node["id"]), None)
                if index is None:
                    items.append(node)
                else:
                    items[index] = node
            elif isinstance(edit, Remove):
                found = False
                for collection, _ in KINDS.values():
                    before = len(data[collection])
                    data[collection] = [n for n in data[collection] if n["id"] != edit.node_id]
                    found |= before != len(data[collection])
                if not found:
                    raise Fault("not_found", "Elemento inexistente.")
                # References remain explicit; the verifier reports dangling dependencies.
            else:
                self.set_relation(data, edit)
        candidate = Model.model_validate(data)
        project_graph(candidate)  # Reject duplicate IDs without hiding scientific defects.
        if len(json.dumps(candidate.model_dump(), ensure_ascii=False).encode()) > 240_000:
            raise Fault("too_large", "Modelo excede o orçamento de 240 KB desta sessão.")
        return candidate

    @staticmethod
    def set_relation(data: dict, edit: Relation) -> None:
        mapping = {
            "ASSUMPTION_FOR": ("assumptions", "equations"),
            "REQUIRES": ("requirements", "equations"),
            "VALIDATED_BY": ("variables", "observations"),
        }
        left, right = mapping[edit.relation]
        source = next((n for n in data[left] if n["id"] == edit.source), None)
        target = next((n for n in data[right] if n["id"] == edit.target), None)
        if source is None or target is None:
            raise Fault("invalid_relation", "Extremos ou tipos incompatíveis com a relação.")
        if edit.relation == "ASSUMPTION_FOR":
            ids = target["assumption_ids"]
            if edit.enabled and edit.source not in ids:
                ids.append(edit.source)
            elif not edit.enabled:
                target["assumption_ids"] = [i for i in ids if i != edit.source]
        else:
            owner, field, value = (
                (source, "equation_id", edit.target)
                if edit.relation == "REQUIRES"
                else (target, "variable_id", edit.source)
            )
            if not edit.enabled and owner[field] != value:
                raise Fault("not_found", "A relação solicitada não existe.")
            missing = "unconnected_reference"
            existing = {node["id"] for collection, _ in KINDS.values() for node in data[collection]}
            suffix = 1
            while missing in existing:
                missing = f"unconnected_reference_{suffix}"
                suffix += 1
            owner[field] = value if edit.enabled else missing

    def execute(self, request) -> dict:
        if isinstance(request, Describe):
            return {
                "name": "Nexo local authoring",
                "protocol_version": 1,
                "schema": ADAPTER.json_schema(),
                "scope": "isolated_process_session",
                "limits": {
                    "request_bytes": MAX_REQUEST_BYTES,
                    "model_bytes": 240_000,
                    "runs": 20,
                    "history_bytes": MAX_HISTORY_BYTES,
                },
                "limitations": [
                    "Não controla a janela desktop. Não é MCP.",
                    "Sem acesso a arquivos, GitHub, rede ou código importado.",
                    "Sessão em memória; exporte JSON antes de encerrar.",
                    "INPUT_TO/PRODUCES derivam da AST explícita de equation.",
                ],
            }
        if isinstance(request, Create):
            if self.model is not None:
                raise Fault(
                    "project_exists", "Esta sessão já contém um projeto; não foi substituído."
                )
            project_graph(request.model)
            if len(json.dumps(request.model.model_dump(), ensure_ascii=False).encode()) > 240_000:
                raise Fault("too_large", "Modelo excede o orçamento de 240 KB desta sessão.")
            self.model = request.model.model_copy(deep=True)
            return self.snapshot()
        self.guard(request)
        if isinstance(request, ExportProposal):
            if request.base_model.id != self.model.id:
                raise Fault("scope_mismatch", "A base da proposta pertence a outro projeto.")
            project_graph(request.base_model)
            return {
                "format": "nexo-change-proposal",
                "version": 1,
                "project_id": self.model.id,
                "author": request.author,
                "reason": request.reason,
                "base_revision": revision(request.base_model),
                "target_revision": revision(self.model),
                "base_model": request.base_model.model_dump(),
                "candidate_model": self.model.model_dump(),
            }
        if isinstance(request, Apply):
            candidate = self.edit(request.edits)
            self.model = candidate
            return self.snapshot()
        if isinstance(request, Evidence):
            entry = next((e for e in self.history if e["run"]["run_id"] == request.run_id), None)
            if entry is None:
                raise Fault("not_found", "Execução ausente ou removida pela retenção.")
            return {
                "format": "nexo-run-evidence",
                "version": 1,
                "record": deepcopy(entry),
                "current_revision": revision(self.model),
            }
        if request.operation == "analyze":
            run = analyze_isolated(self.model)
            entry = {"model": self.model.model_dump(), "run": run}
            if len(json.dumps(entry).encode()) > MAX_RESPONSE_BYTES:
                raise Fault("too_large", "Evidência excede 4 MB; não foi arquivada.")
            self.history.insert(0, entry)
            while (
                len(self.history) > 20 or len(json.dumps(self.history).encode()) > MAX_HISTORY_BYTES
            ):
                self.history.pop()
                self.evicted += 1
            return {
                "revision": revision(self.model),
                "run": deepcopy(run),
                "retained": len(self.history),
                "evicted": self.evicted,
            }
        return self.snapshot()

    def dispatch(self, raw) -> dict:
        request_id = raw.get("id", "invalid") if isinstance(raw, dict) else "invalid"
        if not isinstance(request_id, str) or len(request_id) > 80:
            request_id = "invalid"
        try:
            data = self.execute(ADAPTER.validate_python(raw))
            return {"protocol_version": 1, "id": request_id, "ok": True, "data": data}
        except Fault as exc:
            code, message = exc.code, exc.message
        except (ValidationError, ValueError, TypeError, RecursionError):
            code, message = (
                "invalid_request",
                "Contrato ou modelo inválido; nenhuma edição aplicada.",
            )
        except Exception:
            code, message = "internal_error", "Operação não concluída; não há validação aprovada."
        return {
            "protocol_version": 1,
            "id": request_id,
            "ok": False,
            "error": {"code": code, "message": message},
            "current_revision": revision(self.model) if self.model else None,
        }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    session = Session()
    while line := sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1):
        if len(line) > MAX_REQUEST_BYTES:
            print(
                json.dumps(
                    {
                        "protocol_version": 1,
                        "id": "invalid",
                        "ok": False,
                        "error": {"code": "too_large", "message": "Requisição excede 256 KB."},
                    }
                ),
                flush=True,
            )
            return  # Do not interpret a truncated tail as another command.
        try:
            response = session.dispatch(json.loads(line))
        except (ValueError, UnicodeDecodeError, RecursionError):
            response = {
                "protocol_version": 1,
                "id": "invalid",
                "ok": False,
                "error": {"code": "invalid_json", "message": "JSON inválido."},
            }
        print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
