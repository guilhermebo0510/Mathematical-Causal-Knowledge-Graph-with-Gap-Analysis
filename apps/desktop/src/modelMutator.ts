import type { Equation, Expr, Graph, GraphNode, Kind, Model } from "./types";
import { parseExpr, replaceInput } from "./expression";

const DEFAULT_SOURCE = "Editado interativamente na sessão local.";

function hasPendingInput(expr: Expr): boolean {
  return expr.var === "unconnected_input" || expr.args.some(hasPendingInput);
}

function assertExpressionLimits(model: Model): void {
  let count = 0;
  function visit(expr: Expr, depth: number) {
    if (depth > 12 || ++count > 1000)
      throw new Error(
        "O modelo excede 1.000 termos ou profundidade de expressão 12.",
      );
    expr.args.forEach((arg) => visit(arg, depth + 1));
  }
  model.equations.forEach((eq) => visit(eq.rhs, 0));
}

export function extractEquationInputs(expr: Expr): string[] {
  const result: string[] = [];
  function walk(node: Expr) {
    if (node.var !== null) {
      if (node.var !== "unconnected_input" && !result.includes(node.var)) {
        result.push(node.var);
      }
      return;
    }
    for (const arg of node.args) {
      walk(arg);
    }
  }
  walk(expr);
  return result;
}

export function getEquationOperator(eq: Equation): "mul" | "add" | "sub" {
  if (eq.rhs.op === "add" || eq.rhs.op === "sub" || eq.rhs.op === "mul") {
    return eq.rhs.op;
  }
  return "mul";
}

export function buildExprFromInputs(
  op: "mul" | "add" | "sub",
  vars: string[],
): Expr {
  const clean = vars.filter((v) => v && v !== "unconnected_input").slice(0, 8);
  if (clean.length === 0) {
    return { var: "unconnected_input", op: null, args: [] };
  }
  if (clean.length === 1) {
    return { var: clean[0], op: null, args: [] };
  }
  if (op === "sub") {
    return {
      var: null,
      op: "sub",
      args: [
        { var: clean[0], op: null, args: [] },
        { var: clean[1], op: null, args: [] },
      ],
    };
  }
  return {
    var: null,
    op,
    args: clean.map((v) => ({ var: v, op: null, args: [] })),
  };
}

export function formatEquationFormula(
  baseLabel: string,
  vars: string[],
  op: "mul" | "add" | "sub",
): string {
  const prefix = baseLabel.split(":")[0]?.trim() || "Equação";
  const clean = vars.filter((v) => v && v !== "unconnected_input");
  if (clean.length === 0) {
    return `${prefix}: (sem entradas)`;
  }
  const sep = op === "add" ? " + " : op === "sub" ? " - " : " · ";
  const body = op === "sub" ? clean.slice(0, 2).join(sep) : clean.join(sep);
  return `${prefix}: ${body}`;
}

export function projectGraph(model: Model): Graph {
  const nodes: GraphNode[] = [];
  const edges: Graph["edges"] = [];

  for (const v of model.variables) {
    nodes.push({ id: v.id, label: v.label, kind: "variable" });
  }
  for (const eq of model.equations) {
    nodes.push({ id: eq.id, label: eq.label, kind: "equation" });
  }
  for (const a of model.assumptions) {
    nodes.push({ id: a.id, label: a.label, kind: "assumption" });
  }
  for (const r of model.requirements) {
    nodes.push({ id: r.id, label: r.label, kind: "requirement" });
  }
  for (const o of model.observations) {
    nodes.push({ id: o.id, label: o.label, kind: "observation" });
  }

  const existing = new Set(nodes.map((n) => n.id));

  const addEdge = (source: string, target: string, relation: string) => {
    if (existing.has(source) && existing.has(target)) {
      edges.push({
        id: `e${edges.length}`,
        source,
        target,
        relation,
      });
    }
  };

  for (const eq of model.equations) {
    const refs = extractEquationInputs(eq.rhs).sort();
    for (const name of refs) {
      addEdge(name, eq.id, "INPUT_TO");
    }
    addEdge(eq.id, eq.lhs, "PRODUCES");
    for (const name of eq.assumption_ids) {
      addEdge(name, eq.id, "ASSUMPTION_FOR");
    }
  }
  for (const req of model.requirements) {
    addEdge(req.id, req.equation_id, "REQUIRES");
  }
  for (const obs of model.observations) {
    addEdge(obs.variable_id, obs.id, "VALIDATED_BY");
  }

  return { nodes, edges };
}

export type RelationType =
  | "INPUT_TO"
  | "PRODUCES"
  | "ASSUMPTION_FOR"
  | "REQUIRES"
  | "VALIDATED_BY";

export const RELATION_LABELS: Record<RelationType, string> = {
  INPUT_TO: "Entrada da equação (E)",
  PRODUCES: "Saída calculada (S)",
  ASSUMPTION_FOR: "Hipótese da equação (HIP)",
  REQUIRES: "Requisito de cobertura (REQ)",
  VALIDATED_BY: "Validação empírica (VAL)",
};

function findNodeKind(model: Model, id: string): Kind | null {
  if (model.variables.some((v) => v.id === id)) return "variable";
  if (model.equations.some((e) => e.id === id)) return "equation";
  if (model.assumptions.some((a) => a.id === id)) return "assumption";
  if (model.requirements.some((r) => r.id === id)) return "requirement";
  if (model.observations.some((o) => o.id === id)) return "observation";
  return null;
}

export function resolveConnection(
  model: Model,
  fromId: string,
  toId: string,
  fromPortKind?: number,
  toPortKind?: number,
  preferredRelation?: RelationType,
):
  | { ok: true; source: string; target: string; relation: RelationType }
  | { ok: false; reason: string } {
  if (fromId === toId)
    return { ok: false, reason: "Não é possível conectar um nó a si mesmo." };
  const from = findNodeKind(model, fromId),
    to = findNodeKind(model, toId);
  if (!from || !to)
    return {
      ok: false,
      reason: "Elemento de origem ou destino não encontrado.",
    };
  const portFor = (id: string) => (id === fromId ? fromPortKind : toPortKind);
  let source = fromId,
    target = toId,
    relation: RelationType;
  let expectedFrom: number, expectedTo: number;
  if (
    (from === "variable" && to === "equation") ||
    (from === "equation" && to === "variable")
  ) {
    const eq = from === "equation" ? fromId : toId,
      v = from === "variable" ? fromId : toId;
    const output = preferredRelation
      ? preferredRelation === "PRODUCES"
      : portFor(eq) !== undefined
        ? portFor(eq) === 1
        : from === "equation";
    relation = output ? "PRODUCES" : "INPUT_TO";
    source = output ? eq : v;
    target = output ? v : eq;
    expectedFrom = 1;
    expectedTo = 0;
  } else if (
    (from === "assumption" && to === "equation") ||
    (to === "assumption" && from === "equation")
  ) {
    source = from === "assumption" ? fromId : toId;
    target = from === "equation" ? fromId : toId;
    relation = "ASSUMPTION_FOR";
    expectedFrom = 1;
    expectedTo = 2;
  } else if (
    (from === "requirement" && to === "equation") ||
    (to === "requirement" && from === "equation")
  ) {
    source = from === "requirement" ? fromId : toId;
    target = from === "equation" ? fromId : toId;
    relation = "REQUIRES";
    expectedFrom = 1;
    expectedTo = 3;
  } else if (
    (from === "variable" && to === "observation") ||
    (to === "variable" && from === "observation")
  ) {
    source = from === "variable" ? fromId : toId;
    target = from === "observation" ? fromId : toId;
    relation = "VALIDATED_BY";
    expectedFrom = 4;
    expectedTo = 4;
  } else
    return {
      ok: false,
      reason:
        "Tipos incompatíveis. Use uma relação de dados, hipótese, cobertura ou referência.",
    };
  if (preferredRelation && preferredRelation !== relation)
    return {
      ok: false,
      reason: "A relação escolhida não se aplica a estes tipos de nó.",
    };
  if (
    (portFor(source) !== undefined && portFor(source) !== expectedFrom) ||
    (portFor(target) !== undefined && portFor(target) !== expectedTo)
  )
    return {
      ok: false,
      reason: "Portas incompatíveis com a direção e o tipo desta ligação.",
    };
  return { ok: true, source, target, relation };
}

export function connectNodes(
  model: Model,
  fromId: string,
  toId: string,
  fromPortKind?: number,
  toPortKind?: number,
  preferredRelation?: RelationType,
):
  | {
      ok: true;
      model: Model;
      graph: Graph;
      relation: RelationType;
      source: string;
      target: string;
    }
  | { ok: false; reason: string } {
  const resolved = resolveConnection(
    model,
    fromId,
    toId,
    fromPortKind,
    toPortKind,
    preferredRelation,
  );
  if (!resolved.ok) return resolved;

  const { source, target, relation } = resolved;
  const next: Model = structuredClone(model);
  const graph = projectGraph(model);
  if (
    graph.edges.some(
      (e) =>
        e.source === source && e.target === target && e.relation === relation,
    )
  ) {
    return { ok: true, model: next, graph, relation, source, target };
  }
  if (relation === "INPUT_TO" || relation === "PRODUCES") {
    const seen = new Set<string>();
    const stack = [target];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === source)
        return {
          ok: false,
          reason:
            "Esta ligação criaria um ciclo de cálculo. O motor atual não resolve sistemas simultâneos.",
        };
      if (seen.has(id)) continue;
      seen.add(id);
      graph.edges
        .filter(
          (e) =>
            e.source === id &&
            (e.relation === "INPUT_TO" || e.relation === "PRODUCES"),
        )
        .forEach((e) => stack.push(e.target));
    }
  }

  if (relation === "INPUT_TO") {
    const eq = next.equations.find((e) => e.id === target);
    if (!eq) return { ok: false, reason: "Equação não encontrada." };
    const op = getEquationOperator(eq);
    const currentVars = extractEquationInputs(eq.rhs);
    if (!currentVars.includes(source)) {
      if (currentVars.length >= 8) {
        return {
          ok: false,
          reason: "Uma equação suporta no máximo 8 entradas diretas.",
        };
      }
      currentVars.push(source);
    }
    if (eq.rhs.var === "unconnected_input") {
      eq.rhs = { var: source, op: null, args: [] };
    } else if (eq.rhs.var !== null) {
      return {
        ok: false,
        reason:
          "Defina a operação nas propriedades: adicionar uma segunda entrada não determina se ela deve somar, subtrair ou multiplicar.",
      };
    } else if (hasPendingInput(eq.rhs)) {
      return {
        ok: false,
        reason:
          "A expressão tem operandos pendentes. Use Desfazer para restaurar a ligação ou defina a expressão nas propriedades.",
      };
    } else if (op === "sub") {
      return {
        ok: false,
        reason:
          "Subtração tem dois operandos. Edite a expressão para definir os parênteses e a ordem, sem descartar entradas.",
      };
    } else {
      // Add a term without flattening nested operations or deduplicating occurrences.
      eq.rhs = {
        var: null,
        op,
        args: [eq.rhs, { var: source, op: null, args: [] }],
      };
    }
  } else if (relation === "PRODUCES") {
    const eq = next.equations.find((e) => e.id === source);
    if (!eq) return { ok: false, reason: "Equação não encontrada." };
    if (next.equations.some((e) => e.id !== source && e.lhs === target))
      return {
        ok: false,
        reason: "A variável já possui uma equação produtora.",
      };
    if (next.variables.find((v) => v.id === target)?.value != null)
      return {
        ok: false,
        reason:
          "A saída deve ser uma variável derivada, sem valor de entrada fixado.",
      };
    if (next.variables.some((v) => v.id === eq.lhs))
      return {
        ok: false,
        reason:
          "A equação já possui uma saída. Altere o destino nas propriedades ou desconecte a saída atual.",
      };
    eq.lhs = target;
  } else if (relation === "ASSUMPTION_FOR") {
    const eq = next.equations.find((e) => e.id === target);
    if (!eq) return { ok: false, reason: "Equação não encontrada." };
    if (!eq.assumption_ids.includes(source)) {
      eq.assumption_ids.push(source);
    }
  } else if (relation === "REQUIRES") {
    const req = next.requirements.find((r) => r.id === source);
    if (!req) return { ok: false, reason: "Requisito não encontrado." };
    req.equation_id = target;
  } else if (relation === "VALIDATED_BY") {
    const obs = next.observations.find((o) => o.id === target);
    if (!obs) return { ok: false, reason: "Observação não encontrada." };
    obs.variable_id = source;
  }

  try {
    assertExpressionLimits(next);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  return {
    ok: true,
    model: next,
    graph: projectGraph(next),
    relation,
    source,
    target,
  };
}

export function disconnectEdge(
  model: Model,
  edge: { source: string; target: string; relation: string },
): { model: Model; graph: Graph } {
  const next: Model = structuredClone(model);

  if (edge.relation === "INPUT_TO") {
    const eq = next.equations.find((e) => e.id === edge.target);
    if (eq) {
      eq.rhs = replaceInput(eq.rhs, edge.source);
    }
  } else if (edge.relation === "PRODUCES") {
    const eq = next.equations.find((e) => e.id === edge.source);
    if (eq && eq.lhs === edge.target) {
      eq.lhs = "unconnected_output";
    }
  } else if (edge.relation === "ASSUMPTION_FOR") {
    const eq = next.equations.find((e) => e.id === edge.target);
    if (eq) {
      eq.assumption_ids = eq.assumption_ids.filter((id) => id !== edge.source);
    }
  } else if (edge.relation === "REQUIRES") {
    const req = next.requirements.find((r) => r.id === edge.source);
    if (req && req.equation_id === edge.target) {
      req.equation_id = "unconnected_equation";
    }
  } else if (edge.relation === "VALIDATED_BY") {
    const obs = next.observations.find((o) => o.id === edge.target);
    if (obs && obs.variable_id === edge.source) {
      obs.variable_id = "unconnected_variable";
    }
  }

  return { model: next, graph: projectGraph(next) };
}

function nextUniqueId(existing: Set<string>, prefix: string): string {
  let n = 1;
  while (existing.has(`${prefix}_${n}`)) {
    n++;
  }
  return `${prefix}_${n}`;
}

export function createNodeInModel(
  model: Model,
  kind: Kind,
): { model: Model; graph: Graph; nodeId: string } {
  const next: Model = structuredClone(model);
  const limits = {
    variable: 100,
    equation: 50,
    assumption: 30,
    requirement: 30,
    observation: 30,
  };
  const collections = {
    variable: next.variables,
    equation: next.equations,
    assumption: next.assumptions,
    requirement: next.requirements,
    observation: next.observations,
  };
  if (collections[kind].length >= limits[kind])
    throw new Error(
      `Limite atual: ${limits[kind]} elementos deste tipo por modelo.`,
    );
  const existing = new Set([
    ...next.variables.map((v) => v.id),
    ...next.equations.map((e) => e.id),
    ...next.assumptions.map((a) => a.id),
    ...next.requirements.map((r) => r.id),
    ...next.observations.map((o) => o.id),
  ]);

  let nodeId = "";
  if (kind === "variable") {
    nodeId = nextUniqueId(existing, "var");
    next.variables.push({
      id: nodeId,
      label: `Nova variável (${nodeId})`,
      unit: "1",
      value: null,
      source: DEFAULT_SOURCE,
    });
  } else if (kind === "equation") {
    nodeId = nextUniqueId(existing, "eq");
    next.equations.push({
      id: nodeId,
      label: `Nova equação (${nodeId}): (sem entradas)`,
      lhs: "unconnected_output",
      rhs: { var: "unconnected_input", op: null, args: [] },
      assumption_ids: [],
      source: DEFAULT_SOURCE,
    });
  } else if (kind === "assumption") {
    nodeId = nextUniqueId(existing, "hip");
    next.assumptions.push({
      id: nodeId,
      label: `Nova hipótese (${nodeId})`,
      justification: "Hipótese adicionada na sessão para investigação.",
    });
  } else if (kind === "requirement") {
    nodeId = nextUniqueId(existing, "req");
    next.requirements.push({
      id: nodeId,
      label: `Novo requisito (${nodeId})`,
      equation_id: "unconnected_equation",
      exclusion_reason: null,
    });
  } else {
    nodeId = nextUniqueId(existing, "obs");
    next.observations.push({
      id: nodeId,
      label: `Nova referência (${nodeId})`,
      variable_id: "unconnected_variable",
      value: 0,
      unit: "1",
      tolerance: 0,
      source: DEFAULT_SOURCE,
    });
  }

  assertExpressionLimits(next);
  return { model: next, graph: projectGraph(next), nodeId };
}

export interface NodeUpdatePatch {
  label?: string;
  unit?: string;
  value?: number | null;
  op?: "mul" | "add" | "sub";
  justification?: string;
  exclusion_reason?: string | null;
  tolerance?: number;
  source?: string;
  expression?: string;
  lhs?: string;
  equation_id?: string;
  variable_id?: string;
}

/** Catalog creation uses the same limits and expression validation as the inspector. */
export function createConfiguredNode(
  model: Model,
  kind: Kind,
  id: string,
  patch: NodeUpdatePatch,
): { model: Model; graph: Graph; nodeId: string } {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id))
    throw new Error("ID: use uma letra inicial e até 64 letras, números ou sublinhados.");
  if (projectGraph(model).nodes.some((node) => node.id === id))
    throw new Error(`O elemento com ID '${id}' já existe no modelo.`);
  const created = createNodeInModel(model, kind);
  const entry = [
    ...created.model.variables, ...created.model.equations,
    ...created.model.assumptions, ...created.model.requirements,
    ...created.model.observations,
  ].find((node) => node.id === created.nodeId)!;
  entry.id = id;
  const updated = updateNodeInModel(created.model, id, patch);
  return { ...updated, nodeId: id };
}

export function updateNodeInModel(
  model: Model,
  nodeId: string,
  patch: NodeUpdatePatch,
): { model: Model; graph: Graph } {
  const next: Model = structuredClone(model);
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Valores devem ser números finitos.");
    if (
      typeof value === "string" &&
      value.length > (key === "expression" ? 4000 : key === "unit" ? 64 : 300)
    )
      throw new Error("Campo excede o limite de tamanho.");
  }
  if (patch.tolerance !== undefined && patch.tolerance < 0)
    throw new Error("Tolerância não pode ser negativa.");
  if (
    patch.unit !== undefined &&
    (!/^[a-zA-Z0-9_ */().^+\-]+$/.test(patch.unit) ||
      [...patch.unit.matchAll(/\d+/g)].some((m) => Number(m[0]) > 12))
  )
    throw new Error(
      "Unidade inválida; use a sintaxe de unidades do modelo, com expoentes até 12.",
    );
  if (patch.label !== undefined && !patch.label.trim())
    throw new Error("Informe um rótulo.");
  if (patch.source !== undefined && !patch.source.trim())
    throw new Error(
      "Informe a fonte ou indique explicitamente que ainda não foi informada.",
    );

  const variable = next.variables.find((v) => v.id === nodeId);
  if (variable) {
    if (patch.label !== undefined && patch.label.trim()) {
      variable.label = patch.label.trim();
    }
    if (patch.unit !== undefined && patch.unit.trim()) {
      variable.unit = patch.unit.trim();
    }
    if (patch.value !== undefined) {
      if (patch.value !== null && next.equations.some((e) => e.lhs === nodeId))
        throw new Error(
          "Variável calculada não pode receber valor fixo. Edite a equação produtora.",
        );
      variable.value = patch.value;
    }
    if (patch.source !== undefined) variable.source = patch.source.trim();
  }

  const equation = next.equations.find((e) => e.id === nodeId);
  if (equation) {
    if (patch.label !== undefined) equation.label = patch.label.trim();
    if (patch.source !== undefined) equation.source = patch.source.trim();
    if (patch.expression !== undefined)
      equation.rhs = parseExpr(
        patch.expression,
        new Set(next.variables.map((v) => v.id)),
      );
    if (patch.op !== undefined && equation.rhs.var === null) {
      if (patch.op === "sub" && equation.rhs.args.length !== 2)
        throw new Error("Subtração requer dois operandos; edite a expressão.");
      equation.rhs = { ...equation.rhs, op: patch.op };
    }
    if (patch.lhs !== undefined) {
      const output = next.variables.find((v) => v.id === patch.lhs);
      if (!output || output.value !== null)
        throw new Error("Selecione uma variável derivada sem valor fixado.");
      if (next.equations.some((e) => e.id !== nodeId && e.lhs === patch.lhs))
        throw new Error("A variável já possui outra equação produtora.");
      equation.lhs = patch.lhs;
    }
  }

  const assumption = next.assumptions.find((a) => a.id === nodeId);
  if (assumption) {
    if (patch.label !== undefined && patch.label.trim()) {
      assumption.label = patch.label.trim();
    }
    if (patch.justification !== undefined && patch.justification.trim()) {
      assumption.justification = patch.justification.trim();
    }
  }

  const requirement = next.requirements.find((r) => r.id === nodeId);
  if (requirement) {
    if (patch.equation_id !== undefined) {
      if (!next.equations.some((e) => e.id === patch.equation_id))
        throw new Error("Equação do requisito não encontrada.");
      requirement.equation_id = patch.equation_id;
    }
    if (patch.label !== undefined && patch.label.trim()) {
      requirement.label = patch.label.trim();
    }
    if (patch.exclusion_reason !== undefined) {
      requirement.exclusion_reason = patch.exclusion_reason?.trim() || null;
    }
  }

  const observation = next.observations.find((o) => o.id === nodeId);
  if (observation) {
    if (patch.source !== undefined) observation.source = patch.source.trim();
    if (patch.variable_id !== undefined) {
      if (!next.variables.some((v) => v.id === patch.variable_id))
        throw new Error("Variável de referência não encontrada.");
      observation.variable_id = patch.variable_id;
    }
    if (patch.label !== undefined && patch.label.trim()) {
      observation.label = patch.label.trim();
    }
    if (patch.unit !== undefined && patch.unit.trim()) {
      observation.unit = patch.unit.trim();
    }
    if (patch.value !== undefined && patch.value !== null) {
      observation.value = patch.value;
    }
    if (patch.tolerance !== undefined && patch.tolerance >= 0) {
      observation.tolerance = patch.tolerance;
    }
  }

  assertExpressionLimits(next);
  return { model: next, graph: projectGraph(next) };
}

export function deleteNodeFromModel(
  model: Model,
  nodeId: string,
): { model: Model; graph: Graph } {
  const next: Model = structuredClone(model);
  if (
    next.variables.length <= 1 &&
    next.variables.some((v) => v.id === nodeId)
  ) {
    throw new Error("O modelo precisa manter ao menos uma variável.");
  }

  next.variables = next.variables.filter((v) => v.id !== nodeId);
  next.equations = next.equations.filter((e) => e.id !== nodeId);
  next.assumptions = next.assumptions.filter((a) => a.id !== nodeId);
  next.requirements = next.requirements.filter((r) => r.id !== nodeId);
  next.observations = next.observations.filter((o) => o.id !== nodeId);

  // Clean up references in remaining entities
  for (const eq of next.equations) {
    if (eq.lhs === nodeId) {
      eq.lhs = "unconnected_output";
    }
    const vars = extractEquationInputs(eq.rhs);
    if (vars.includes(nodeId)) {
      eq.rhs = replaceInput(eq.rhs, nodeId);
    }
    eq.assumption_ids = eq.assumption_ids.filter((id) => id !== nodeId);
  }
  for (const req of next.requirements) {
    if (req.equation_id === nodeId) {
      req.equation_id = "unconnected_equation";
    }
  }
  for (const obs of next.observations) {
    if (obs.variable_id === nodeId) {
      obs.variable_id = "unconnected_variable";
    }
  }

  return { model: next, graph: projectGraph(next) };
}
