"""Small, deliberately bounded verifier. Expressions never pass through eval/parsers."""

import hashlib
import json
import math
from datetime import UTC, datetime
from functools import reduce
from operator import mul
from uuid import uuid4

import networkx as nx
import pint
import sympy

from . import __version__
from .schema import Expr, Model

UNITS = pint.UnitRegistry()


def references(expr: Expr) -> set[str]:
    if expr.var is not None:
        return {expr.var}
    return set().union(*(references(arg) for arg in expr.args))


def project_graph(model: Model) -> dict:
    nodes, edges = [], []
    for kind, objects in (
        ("variable", model.variables),
        ("equation", model.equations),
        ("assumption", model.assumptions),
        ("requirement", model.requirements),
        ("observation", model.observations),
    ):
        nodes.extend({"id": obj.id, "label": obj.label, "kind": kind} for obj in objects)
    existing = {node["id"] for node in nodes}
    if len(existing) != len(nodes):
        raise ValueError("O grafo requer identificadores únicos.")

    def edge(source: str, target: str, relation: str) -> None:
        if source in existing and target in existing:
            edges.append(
                {"id": f"e{len(edges)}", "source": source, "target": target, "relation": relation}
            )

    for eq in model.equations:
        for name in sorted(references(eq.rhs)):
            edge(name, eq.id, "INPUT_TO")
        edge(eq.id, eq.lhs, "PRODUCES")
        for name in eq.assumption_ids:
            edge(name, eq.id, "ASSUMPTION_FOR")
    for req in model.requirements:
        edge(req.id, req.equation_id, "REQUIRES")
    for obs in model.observations:
        edge(obs.variable_id, obs.id, "VALIDATED_BY")
    return {"nodes": nodes, "edges": edges}


def verify(model: Model) -> dict:
    canonical = json.dumps(model.model_dump(), sort_keys=True, separators=(",", ":"))
    revision = hashlib.sha256(canonical.encode()).hexdigest()
    checks: list[dict] = []
    values: dict[str, dict] = {}

    def result() -> dict:
        counts = {
            state: sum(item["status"] == state for item in checks)
            for state in ("passed", "failed", "inconclusive")
        }
        outcome = (
            "attention"
            if counts["failed"]
            else "inconclusive"
            if counts["inconclusive"] or not checks
            else "consistent"
        )
        return {
            "run_id": str(uuid4()),
            "model_revision": revision,
            "engine_version": __version__,
            "created_at": datetime.now(UTC).isoformat(),
            "outcome": outcome,
            "counts": counts,
            "checks": checks,
            "values": values,
            "limitations": [
                "Resultados relativos às regras e hipóteses deste modelo; não provam completude.",
                "Dados de exemplo são sintéticos e não constituem descoberta científica.",
                "O piloto não resolve sistemas simultâneos nem demonstra causalidade.",
            ],
        }

    def check(
        rule: str, status: str, affected: list[str], title: str, evidence: str, action: str
    ) -> None:
        checks.append(
            {
                "id": f"check_{len(checks) + 1}",
                "rule_id": rule,
                "rule_version": 1,
                "status": status,
                "node_ids": affected,
                "title": title,
                "evidence": evidence,
                "suggested_action": action,
            }
        )

    all_objects = [
        *model.variables,
        *model.equations,
        *model.assumptions,
        *model.requirements,
        *model.observations,
    ]
    ids = [obj.id for obj in all_objects]
    if len(ids) != len(set(ids)):
        check(
            "integrity",
            "failed",
            [],
            "Identificadores duplicados",
            "Dois elementos compartilham o mesmo ID.",
            "Use IDs únicos em todo o modelo.",
        )
        return result()

    variables = {var.id: var for var in model.variables}
    assumptions = {item.id for item in model.assumptions}
    producers: dict[str, list] = {}
    broken = False
    for eq in model.equations:
        missing = sorted(({eq.lhs} | references(eq.rhs)) - variables.keys())
        missing_assumptions = sorted(set(eq.assumption_ids) - assumptions)
        if missing or missing_assumptions:
            broken = True
            check(
                "integrity",
                "failed",
                [eq.id],
                "Referência inexistente",
                f"Variáveis: {missing}; hipóteses: {missing_assumptions}.",
                "Cadastre os elementos referenciados ou corrija a equação.",
            )
        producers.setdefault(eq.lhs, []).append(eq)
    for obs in model.observations:
        if obs.variable_id not in variables:
            broken = True
            check(
                "integrity",
                "failed",
                [obs.id],
                "Observação sem variável",
                f"A variável {obs.variable_id} não está cadastrada.",
                "Revise a observação.",
            )
    for name, equations in producers.items():
        if len(equations) > 1 or (name in variables and variables[name].value is not None):
            broken = True
            check(
                "integrity",
                "inconclusive",
                [name, *(eq.id for eq in equations)],
                "Definições simultâneas não suportadas",
                "O piloto resolve uma única definição por saída, sem sobrepor valores de entrada.",
                "Separe observações de entradas; use um solver de sistemas em uma fase futura.",
            )

    equation_ids = {eq.id for eq in model.equations}
    for req in model.requirements:
        covered = req.equation_id in equation_ids
        excluded = bool(req.exclusion_reason)
        check(
            "coverage",
            "passed" if covered or excluded else "failed",
            [req.id],
            "Requisito atendido"
            if covered
            else ("Exclusão declarada" if excluded else "Parcela exigida não modelada"),
            f"Contrato: {req.label}. Equação exigida: {req.equation_id}. "
            + (f"Exclusão: {req.exclusion_reason}" if excluded else ""),
            "Revisar a validade da exclusão."
            if excluded
            else (
                "Nenhuma ação neste contrato."
                if covered
                else (
                    "Modele a parcela ou documente uma exclusão justificada; "
                    "não infira uma nova lei."
                )
            ),
        )
    if broken:
        return result()
    check(
        "integrity",
        "passed",
        [],
        "Referências consistentes",
        "IDs, variáveis e hipóteses referenciados estão cadastrados.",
        "A integridade estrutural não demonstra validade científica.",
    )

    graph = nx.DiGraph()
    graph.add_nodes_from(variables)
    for eq in model.equations:
        graph.add_edges_from((name, eq.lhs) for name in references(eq.rhs))
    if not nx.is_directed_acyclic_graph(graph):
        check(
            "dependencies",
            "inconclusive",
            list(nx.find_cycle(graph)[0]),
            "Sistema cíclico requer outro método",
            "Ciclos podem representar sistemas simultâneos legítimos; "
            "o piloto só avalia dependências acíclicas.",
            "Encaminhe o sistema a um solver adequado; não trate o ciclo como erro científico.",
        )
        return result()

    quantities: dict = {}
    invalid_units: set[str] = set()
    for var in model.variables:
        try:
            # Registry handles units only; never parse a user expression as Python or SymPy code.
            unit = UNITS.Unit(var.unit)
            if var.value is not None:
                quantities[var.id] = UNITS.Quantity(var.value, unit)
                values[var.id] = {"value": var.value, "unit": var.unit, "origin": "input"}
        except (pint.PintError, ValueError, TypeError, KeyError, OverflowError) as exc:
            invalid_units.add(var.id)
            check(
                "dimensions",
                "failed",
                [var.id],
                "Unidade não suportada",
                f"Não foi possível interpretar a unidade ({type(exc).__name__}).",
                "Use uma unidade física suportada; "
                "temperaturas absolutas com offset exigem cuidado.",
            )

    def evaluate(expr: Expr, quantities_by_id: dict):
        if expr.var is not None:
            return quantities_by_id[expr.var]
        args = [evaluate(arg, quantities_by_id) for arg in expr.args]
        if expr.op == "mul":
            return reduce(mul, args)
        if expr.op == "sub":
            return args[0] - args[1]
        return sum(args[1:], args[0])

    def symbolic(expr: Expr):
        if expr.var is not None:
            return sympy.Symbol(expr.var, real=True)
        args = [symbolic(arg) for arg in expr.args]
        if expr.op == "mul":
            return sympy.Mul(*args)
        if expr.op == "sub":
            return args[0] - args[1]
        return sympy.Add(*args)

    by_output = {eq.lhs: eq for eq in model.equations}
    for name in nx.topological_sort(graph):
        eq = by_output.get(name)
        if eq is None:
            continue
        inputs = references(eq.rhs)
        if (inputs | {eq.lhs}) & invalid_units:
            check(
                "dimensions",
                "inconclusive",
                [eq.id],
                "Dimensão não verificável",
                "Uma unidade de entrada ou saída é inválida.",
                "Corrija as unidades indicadas.",
            )
            continue
        try:
            # Check dimensions independently of available numeric inputs.
            unit_inputs = {key: UNITS.Quantity(1, variables[key].unit) for key in inputs}
            evaluate(eq.rhs, unit_inputs).to(variables[eq.lhs].unit)
            check(
                "dimensions",
                "passed",
                [eq.id],
                "Dimensões compatíveis",
                f"{eq.label}; saída em {variables[eq.lhs].unit}.",
                "Consistência dimensional não comprova a adequação do modelo.",
            )
        except (pint.PintError, ValueError, TypeError, KeyError, OverflowError) as exc:
            check(
                "dimensions",
                "failed",
                [eq.id, eq.lhs, *sorted(inputs)],
                "Dimensões incompatíveis",
                f"{eq.label}: {type(exc).__name__}.",
                "Confira as unidades dos operandos e da saída.",
            )
            continue
        missing = sorted(inputs - quantities.keys())
        if missing:
            check(
                "dependencies",
                "failed",
                [eq.id, *missing],
                "Entrada sem valor ou derivação",
                f"Não há resultado disponível para: {', '.join(missing)}.",
                "Forneça o dado com origem ou uma derivação válida.",
            )
            continue
        try:
            quantity = evaluate(eq.rhs, quantities).to(variables[eq.lhs].unit)
            number = float(quantity.magnitude)
            if not math.isfinite(number):
                raise ValueError("Resultado não finito.")
            quantities[eq.lhs] = quantity
            values[eq.lhs] = {
                "value": number,
                "unit": variables[eq.lhs].unit,
                "origin": eq.id,
                "expression": str(symbolic(eq.rhs)),
            }
            check(
                "dependencies",
                "passed",
                [eq.id],
                "Cálculo executado",
                f"{eq.lhs} = {number:g} {variables[eq.lhs].unit}. Fonte: {eq.source}",
                "Revise as hipóteses antes de aplicar o resultado a dados reais.",
            )
        except (pint.PintError, ValueError, TypeError, OverflowError) as exc:
            check(
                "evaluation",
                "inconclusive",
                [eq.id],
                "Cálculo não concluído",
                f"Falha: {type(exc).__name__}.",
                "Revise o domínio e a escala das entradas.",
            )

    for obs in model.observations:
        if obs.variable_id not in quantities:
            check(
                "residual",
                "inconclusive",
                [obs.id, obs.variable_id],
                "Comparação sem previsão disponível",
                "O cálculo da variável não foi concluído.",
                "Resolva os achados nas dependências antes de comparar com observações.",
            )
            continue
        try:
            prediction = float(quantities[obs.variable_id].to(obs.unit).magnitude)
            residual = abs(prediction - obs.value)
            passed = residual <= obs.tolerance
            check(
                "residual",
                "passed" if passed else "failed",
                [obs.id, obs.variable_id],
                "Referência compatível" if passed else "Previsão diverge da referência",
                f"Previsto: {prediction:g} {obs.unit}; referência: {obs.value:g} {obs.unit}; "
                f"resíduo absoluto: {residual:g} {obs.unit}; "
                f"tolerância: {obs.tolerance:g} {obs.unit}. "
                f"Origem: {obs.source}",
                "Nenhuma divergência nesta tolerância."
                if passed
                else (
                    "Investigue dados, calibração e parcelas omitidas; "
                    "o resíduo não identifica causa única."
                ),
            )
        except (pint.PintError, ValueError, TypeError, KeyError, OverflowError) as exc:
            check(
                "residual",
                "inconclusive",
                [obs.id],
                "Observação incompatível",
                f"Falha na conversão: {type(exc).__name__}.",
                "Revise a unidade da observação.",
            )
    return result()
