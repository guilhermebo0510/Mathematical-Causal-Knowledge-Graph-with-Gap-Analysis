"""Optional MCP stdio adapter. Scientific semantics stay in the local connector."""

import asyncio
import json
import sys
from copy import deepcopy
from typing import Literal

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from pydantic import Field

from . import __version__
from .connector import (
    Apply,
    BaseRequest,
    Create,
    Describe,
    Evidence,
    ExportProposal,
    Session,
    Snapshot,
)
from .desktop_transport import DesktopDeliveryError
from .desktop_transport import exchange as desktop_exchange
from .protocol import MAX_REQUEST_BYTES

MAX_MCP_LINE = 300_000


class DesktopSubmit(ExportProposal):
    operation: Literal["desktop.submit"]
    connection: str = Field(min_length=1, max_length=600)
    delivery_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")


class DesktopStatus(BaseRequest):
    operation: Literal["desktop.status"]
    connection: str = Field(min_length=1, max_length=600)
    delivery_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")


TOOLS = {
    "nexo_submit_to_desktop": (
        "desktop.submit",
        DesktopSubmit,
        "Export and deliver a proposal to an explicitly connected Windows Nexo session. "
        "Requires the temporary connection code from the desktop. "
        "Queues only: never applies, saves or analyzes. Retry the SAME delivery_id "
        "after an uncertain response; declared author is not authenticated.",
    ),
    "nexo_desktop_status": (
        "desktop.status",
        DesktopStatus,
        "Read delivery state using its explicit temporary Windows connection code and delivery_id. "
        "Applied is a session action, not saved-file state or scientific approval.",
    ),
    "nexo_export_proposal": (
        "proposal.export",
        ExportProposal,
        "Export an unsigned change proposal against an explicit base_model of this project. "
        "Desktop imports it for review, content comparison and undoable acceptance; no live push.",
    ),
    "nexo_describe": (
        "describe",
        Describe,
        "Describe Nexo contracts and limits. Isolated in-memory session; no desktop control.",
    ),
    "nexo_create_project": (
        "project.create",
        Create,
        "Create one project in this process. Does not replace an existing project or run analysis.",
    ),
    "nexo_get_project": (
        "project.get",
        Snapshot,
        "Read the current model, derived graph and revision. Requires current scope/revision.",
    ),
    "nexo_export_project": (
        "project.export",
        Snapshot,
        "Return a snapshot. Save data.model as JSON for desktop import; no file is written here.",
    ),
    "nexo_apply_edits": (
        "project.apply",
        Apply,
        "Apply an atomic batch at the expected revision. node.put requires complete typed data. "
        "Math edges derive from explicit equation AST/lhs; never infer an operator from a link.",
    ),
    "nexo_analyze": (
        "analyze",
        Snapshot,
        "Run the real scientific verifier in a bounded child process; retain evidence in memory. "
        "Tool success is not proof: inspect run.outcome, counts, checks and limitations.",
    ),
    "nexo_get_evidence": (
        "evidence.get",
        Evidence,
        "Read the original model/run for a retained run_id without promoting it to a new result.",
    ),
}


def tool_definitions() -> list[types.Tool]:
    result = []
    for name, (operation, schema_type, description) in TOOLS.items():
        schema = schema_type.model_json_schema()
        for field in ("protocol_version", "id", "operation"):
            schema["properties"].pop(field, None)
            schema["required"].remove(field)
        readonly = operation in {
            "describe",
            "project.get",
            "project.export",
            "evidence.get",
            "proposal.export",
            "desktop.status",
        }
        result.append(
            types.Tool(
                name=name,
                description=description,
                inputSchema=schema,
                annotations=types.ToolAnnotations(
                    readOnlyHint=readonly,
                    destructiveHint=not readonly,
                    idempotentHint=readonly,
                    openWorldHint=False,
                ),
            )
        )
    return result


class Adapter:
    def __init__(self):
        self.session = Session()
        self.lock = anyio.Lock()

    async def call(self, name: str, arguments: dict) -> types.CallToolResult:
        if name not in TOOLS:
            return self.failure("unknown_tool", "Ferramenta não suportada.")
        operation = TOOLS[name][0]
        # Do not let arguments override the fixed transport envelope.
        if any(k in arguments for k in ("protocol_version", "id", "operation")):
            return self.failure("invalid_request", "Campos de transporte não são argumentos.")
        request = {**arguments, "protocol_version": 1, "id": "mcp", "operation": operation}
        try:
            if (
                len(json.dumps(request, ensure_ascii=False, allow_nan=False).encode())
                > MAX_REQUEST_BYTES
            ):
                return self.failure("too_large", "Requisição excede 256 KB.")
        except (ValueError, TypeError, RecursionError):
            return self.failure("invalid_request", "Argumentos inválidos.")
        async with self.lock:
            if operation in {"desktop.submit", "desktop.status"}:
                try:
                    schema = DesktopSubmit if operation == "desktop.submit" else DesktopStatus
                    parsed = schema.model_validate(request)
                    proposal = None
                    if operation == "desktop.submit":
                        export = parsed.model_dump(
                            mode="json", exclude={"connection", "delivery_id"}
                        )
                        export["operation"] = "proposal.export"
                        response = self.session.dispatch(export)
                        if not response["ok"]:
                            return self.result(response)
                        proposal = response["data"]
                    data = await anyio.to_thread.run_sync(
                        desktop_exchange, parsed.connection, parsed.delivery_id, proposal
                    )
                    return self.result(
                        {"protocol_version": 1, "id": "mcp", "ok": True, "data": data}
                    )
                except DesktopDeliveryError as error:
                    return self.failure(error.code, str(error))
                except Exception:
                    # Validation messages can contain the capability/model. Never echo them.
                    return self.failure(
                        "desktop_delivery_failed",
                        "Entrega local não confirmada. Confira a conexão "
                        "e consulte ou repita o mesmo ID.",
                    )
            # SDK cancellation must not leave partially accepted edits/evidence.
            # The child still finishes or reaches its 20 s deadline; no tree-cancel claim.
            candidate = deepcopy(self.session)
            response = await anyio.to_thread.run_sync(candidate.dispatch, request)
            await anyio.lowlevel.checkpoint_if_cancelled()
            self.session = candidate
            return self.result(response)

    @staticmethod
    def result(response: dict) -> types.CallToolResult:
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(response, ensure_ascii=False))],
            structuredContent=response,
            isError=not response["ok"],
        )

    def failure(self, code: str, message: str) -> types.CallToolResult:
        return self.result(
            {
                "protocol_version": 1,
                "id": "mcp",
                "ok": False,
                "error": {"code": code, "message": message},
            }
        )


class BoundedStdin:
    async def __aiter__(self):
        while line := await anyio.to_thread.run_sync(sys.stdin.buffer.readline, MAX_MCP_LINE + 1):
            if len(line) > MAX_MCP_LINE:
                raise ValueError("MCP input limit")
            # Avoid SDK validation logs echoing a malformed private document.
            try:
                types.JSONRPCMessage.model_validate_json(line)
            except Exception:
                raise ValueError("Malformed MCP input") from None
            yield line.decode("utf-8", errors="strict")


def create_server() -> Server:
    adapter = Adapter()
    server = Server(
        "nexo-local",
        version=__version__,
        instructions=(
            "Local isolated Nexo model session. "
            "Optional explicit Windows desktop proposal connection. "
            "No network or arbitrary filesystem access. "
            "No GitHub, sampling or imported code execution. Export before process exit. "
            "Calls require session_id/project_id/expected_revision from the last snapshot. "
            "Scientific attention/inconclusive are analysis results, never scientific approval."
        ),
    )

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return tool_definitions()

    # Pydantic connector validation returns sanitized errors, without echoing private input.
    @server.call_tool(validate_input=False)
    async def call_tool(name: str, arguments: dict) -> types.CallToolResult:
        return await adapter.call(name, arguments)

    return server


async def run() -> None:
    server = create_server()
    async with stdio_server(stdin=BoundedStdin()) as (read, write):
        await server.run(read, write, server.create_initialization_options())


def main() -> None:
    try:
        asyncio.run(run())
    except (Exception, KeyboardInterrupt):
        # Never put diagnostics on the MCP wire or echo model payloads in tracebacks.
        print(
            "Nexo MCP encerrado: entrada inválida, limite ou falha de transporte.", file=sys.stderr
        )
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
