"""Versioned JSON-lines protocol, identical for desktop and development adapter."""

import json
import sys
from typing import Literal

from pydantic import Field, ValidationError

from .examples import CATALOG, load_example
from .schema import Model, StrictModel
from .verification import project_graph, verify

MAX_REQUEST_BYTES = 256_000


class Request(StrictModel):
    protocol_version: Literal[1]
    id: str = Field(min_length=1, max_length=80)
    operation: Literal["list_examples", "load_example", "import_model", "analyze"]
    example_id: str | None = Field(default=None, max_length=64)
    model: Model | None = None


def dispatch(raw: dict) -> dict:
    request_id = raw.get("id", "invalid") if isinstance(raw, dict) else "invalid"
    if not isinstance(request_id, str) or len(request_id) > 80:
        request_id = "invalid"
    try:
        request = Request.model_validate(raw)
        if request.operation == "list_examples":
            data = CATALOG
        elif request.operation == "load_example":
            model = load_example(request.example_id or "")
            data = {"model": model.model_dump(), "graph": project_graph(model)}
        else:
            if request.model is None:
                raise ValueError("Esta operação requer um modelo.")
            data = (
                verify(request.model)
                if request.operation == "analyze"
                else {"model": request.model.model_dump(), "graph": project_graph(request.model)}
            )
        return {"protocol_version": 1, "id": request.id, "ok": True, "data": data}
    except ValidationError as exc:
        # Do not echo input payloads (documents may be private).
        errors = [".".join(str(part) for part in error["loc"]) for error in exc.errors()[:8]]
        message = "Modelo ou requisição inválida. Confira: " + ", ".join(errors)
    except (ValueError, TypeError, RecursionError):
        message = "Modelo inválido, exemplo desconhecido ou limite de complexidade excedido."
    return {
        "protocol_version": 1,
        "id": request_id,
        "ok": False,
        "error": {"code": "invalid_request", "message": message},
    }


def main() -> None:
    # Windows redirected stdout may default to a legacy code page. The wire is always UTF-8.
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    # A host imposes wall-clock limits; do not accept unbounded input lines.
    while line := sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1):
        if len(line) > MAX_REQUEST_BYTES:
            response = {
                "protocol_version": 1,
                "id": "invalid",
                "ok": False,
                "error": {"code": "too_large", "message": "Arquivo excede 256 KB."},
            }
            print(json.dumps(response, ensure_ascii=False), flush=True)
            return
        try:
            response = dispatch(json.loads(line))
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
            response = {
                "protocol_version": 1,
                "id": "invalid",
                "ok": False,
                "error": {"code": "invalid_json", "message": "JSON inválido."},
            }
        except Exception:
            # Unexpected errors must not become successful verification outcomes.
            response = {
                "protocol_version": 1,
                "id": "invalid",
                "ok": False,
                "error": {"code": "engine_error", "message": "O motor não concluiu a análise."},
            }
        print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
