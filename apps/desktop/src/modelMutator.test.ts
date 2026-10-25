import { describe, expect, it } from "vitest";
import {
  buildExprFromInputs,
  connectNodes,
  createNodeInModel,
  createConfiguredNode,
  deleteNodeFromModel,
  disconnectEdge,
  extractEquationInputs,
  formatEquationFormula,
  getEquationOperator,
  projectGraph,
  resolveConnection,
  updateNodeInModel,
} from "./modelMutator";
import type { Expr, Model } from "./types";

function createSampleModel(): Model {
  return {
    schema_version: 1,
    id: "sample_model",
    title: "Modelo de Teste",
    description: "Modelo sintético para testes unitários.",
    variables: [
      {
        id: "T_amb",
        label: "Temperatura ambiente",
        unit: "K",
        value: 300,
        source: "Medição",
      },
      {
        id: "A",
        label: "Área de troca",
        unit: "m^2",
        value: 2.5,
        source: "Geometria",
      },
      {
        id: "Q",
        label: "Taxa de calor",
        unit: "W",
        value: null,
        source: "Derivado",
      },
    ],
    equations: [
      {
        id: "eq_q",
        label: "Equação de calor: T_amb · A",
        lhs: "Q",
        rhs: {
          var: null,
          op: "mul",
          args: [
            { var: "T_amb", op: null, args: [] },
            { var: "A", op: null, args: [] },
          ],
        },
        assumption_ids: ["hip_steady"],
        source: "Fourier",
      },
    ],
    assumptions: [
      {
        id: "hip_steady",
        label: "Regime permanente",
        justification: "Condições nominais.",
      },
    ],
    requirements: [
      {
        id: "req_loss",
        label: "Considerar perdas",
        equation_id: "eq_q",
        exclusion_reason: null,
      },
    ],
    observations: [
      {
        id: "obs_q",
        label: "Medição em bancada",
        variable_id: "Q",
        value: 750,
        unit: "W",
        tolerance: 20,
        source: "Bancada A",
      },
    ],
  };
}

describe("modelMutator - projectGraph", () => {
  it("projects all entities into graph nodes and correct directed edges", () => {
    const model = createSampleModel();
    const graph = projectGraph(model);

    expect(graph.nodes.length).toBe(7);
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "T_amb",
      "A",
      "Q",
      "eq_q",
      "hip_steady",
      "req_loss",
      "obs_q",
    ]);

    const relations = graph.edges.map(
      (e) => `${e.source} -[${e.relation}]-> ${e.target}`,
    );
    expect(relations).toContain("T_amb -[INPUT_TO]-> eq_q");
    expect(relations).toContain("A -[INPUT_TO]-> eq_q");
    expect(relations).toContain("eq_q -[PRODUCES]-> Q");
    expect(relations).toContain("hip_steady -[ASSUMPTION_FOR]-> eq_q");
    expect(relations).toContain("req_loss -[REQUIRES]-> eq_q");
    expect(relations).toContain("Q -[VALIDATED_BY]-> obs_q");
  });
});

describe("modelMutator - resolveConnection", () => {
  const model = createSampleModel();

  it("resolves variable -> equation as INPUT_TO by default", () => {
    const res = resolveConnection(model, "T_amb", "eq_q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.relation).toBe("INPUT_TO");
      expect(res.source).toBe("T_amb");
      expect(res.target).toBe("eq_q");
    }
  });

  it("resolves equation -> variable as PRODUCES", () => {
    const res = resolveConnection(model, "eq_q", "Q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.relation).toBe("PRODUCES");
      expect(res.source).toBe("eq_q");
      expect(res.target).toBe("Q");
    }
  });

  it("resolves assumption -> equation as ASSUMPTION_FOR", () => {
    const res = resolveConnection(model, "hip_steady", "eq_q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.relation).toBe("ASSUMPTION_FOR");
    }
  });

  it("resolves requirement -> equation as REQUIRES", () => {
    const res = resolveConnection(model, "req_loss", "eq_q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.relation).toBe("REQUIRES");
    }
  });

  it("resolves variable -> observation as VALIDATED_BY", () => {
    const res = resolveConnection(model, "Q", "obs_q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.relation).toBe("VALIDATED_BY");
    }
  });

  it("rejects self connections", () => {
    const res = resolveConnection(model, "T_amb", "T_amb");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("si mesmo");
    }
  });

  it("rejects incompatible connections between two assumptions", () => {
    const res = resolveConnection(model, "hip_steady", "req_loss");
    expect(res.ok).toBe(false);
  });
});

describe("modelMutator - connectNodes and disconnectEdge", () => {
  it("connects a new variable to equation inputs and recalculates formula", () => {
    const model = createSampleModel();
    // Add an extra variable first
    const { model: m1 } = createNodeInModel(model, "variable");
    const newVarId = m1.variables[m1.variables.length - 1].id;

    const res = connectNodes(m1, newVarId, "eq_q");
    expect(res.ok).toBe(true);
    if (res.ok) {
      const inputs = extractEquationInputs(res.model.equations[0].rhs);
      expect(inputs).toContain(newVarId);
      expect(
        res.graph.edges.some(
          (e) => e.source === newVarId && e.target === "eq_q",
        ),
      ).toBe(true);
    }
  });

  it("disconnects an input wire without breaking equation integrity", () => {
    const model = createSampleModel();
    const { model: m2, graph: g2 } = disconnectEdge(model, {
      source: "A",
      target: "eq_q",
      relation: "INPUT_TO",
    });

    const inputs = extractEquationInputs(m2.equations[0].rhs);
    expect(inputs).not.toContain("A");
    expect(inputs).toEqual(["T_amb"]);
    expect(g2.edges.some((e) => e.source === "A" && e.target === "eq_q")).toBe(
      false,
    );
  });

  it("disconnects produces wire and sets lhs to unconnected sentinel", () => {
    const model = createSampleModel();
    const { model: m2, graph: g2 } = disconnectEdge(model, {
      source: "eq_q",
      target: "Q",
      relation: "PRODUCES",
    });

    expect(m2.equations[0].lhs).toBe("unconnected_output");
    expect(g2.edges.some((e) => e.relation === "PRODUCES")).toBe(false);
  });

  it("disconnects assumption from equation", () => {
    const model = createSampleModel();
    const { model: m2, graph: g2 } = disconnectEdge(model, {
      source: "hip_steady",
      target: "eq_q",
      relation: "ASSUMPTION_FOR",
    });

    expect(m2.equations[0].assumption_ids).not.toContain("hip_steady");
    expect(g2.edges.some((e) => e.relation === "ASSUMPTION_FOR")).toBe(false);
  });
});

describe("modelMutator - createNodeInModel", () => {
  it("creates nodes for each kind with unique IDs and valid schemas", () => {
    let model = createSampleModel();

    const kinds = [
      "variable",
      "equation",
      "assumption",
      "requirement",
      "observation",
    ] as const;
    for (const kind of kinds) {
      const key = `${kind}s` as
        | "variables"
        | "equations"
        | "assumptions"
        | "requirements"
        | "observations";
      const initialCount = model[key].length;
      const res = createNodeInModel(model, kind);
      expect(res.nodeId).toBeDefined();
      expect(res.model[key].length).toBe(initialCount + 1);
      expect(res.graph.nodes.some((n) => n.id === res.nodeId)).toBe(true);
      model = res.model;
    }
  });
});

describe("modelMutator - updateNodeInModel", () => {
  it("updates variable properties", () => {
    const model = createSampleModel();
    const { model: next } = updateNodeInModel(model, "T_amb", {
      label: "Temperatura Externa",
      value: 305.5,
      unit: "degC",
    });

    const v = next.variables.find((item) => item.id === "T_amb");
    expect(v?.label).toBe("Temperatura Externa");
    expect(v?.value).toBe(305.5);
    expect(v?.unit).toBe("degC");
  });

  it("updates equation operator between mul, add, and sub", () => {
    const model = createSampleModel();
    const { model: nextAdd } = updateNodeInModel(model, "eq_q", { op: "add" });
    expect(getEquationOperator(nextAdd.equations[0])).toBe("add");
    expect(nextAdd.equations[0].rhs.op).toBe("add");

    const { model: nextSub } = updateNodeInModel(nextAdd, "eq_q", {
      op: "sub",
    });
    expect(getEquationOperator(nextSub.equations[0])).toBe("sub");
    expect(nextSub.equations[0].rhs.op).toBe("sub");
  });

  it("updates assumption justification", () => {
    const model = createSampleModel();
    const { model: next } = updateNodeInModel(model, "hip_steady", {
      justification: "Nova justificativa revisada.",
    });

    expect(next.assumptions[0].justification).toBe(
      "Nova justificativa revisada.",
    );
  });
});

describe("modelMutator - deleteNodeFromModel", () => {
  it("deletes a variable and cleans up references in equations and observations", () => {
    const model = createSampleModel();
    const { model: next, graph } = deleteNodeFromModel(model, "A");

    expect(next.variables.some((v) => v.id === "A")).toBe(false);
    expect(graph.nodes.some((n) => n.id === "A")).toBe(false);

    // References to "A" in eq_q.rhs should be cleaned up
    const inputs = extractEquationInputs(next.equations[0].rhs);
    expect(inputs).not.toContain("A");
    expect(inputs).toContain("T_amb");
  });

  it("prevents deleting the last remaining variable to preserve schema compliance", () => {
    const model: Model = {
      ...createSampleModel(),
      variables: [
        { id: "V1", label: "V1", unit: "W", value: 10, source: "teste" },
      ],
    };

    expect(() => deleteNodeFromModel(model, "V1")).toThrow(
      "ao menos uma variável",
    );
  });
});

describe("scientific editing regressions", () => {
  const ref = (id: string): Expr => ({ var: id, op: null, args: [] });
  function nested() {
    const model = createSampleModel();
    model.equations[0].rhs = {
      var: null,
      op: "sub",
      args: [
        { var: null, op: "mul", args: [ref("T_amb"), ref("T_amb")] },
        ref("A"),
      ],
    };
    return model;
  }
  it("renaming an equation preserves nested arithmetic and repeated operands", () => {
    const model = nested();
    const next = updateNodeInModel(model, "eq_q", { label: "Novo nome" }).model;
    expect(next.equations[0].rhs).toEqual(model.equations[0].rhs);
  });
  it("adding an input to subtraction refuses to silently discard an operand", () => {
    const model = nested();
    const next = createNodeInModel(model, "variable").model;
    const result = connectNodes(next, "var_1", "eq_q");
    expect(result.ok).toBe(false);
    expect(next.equations[0].rhs).toEqual(model.equations[0].rhs);
  });
  it("disconnecting preserves operation structure and marks missing operands", () => {
    const model = nested();
    const next = disconnectEdge(model, {
      source: "T_amb",
      target: "eq_q",
      relation: "INPUT_TO",
    }).model;
    expect(next.equations[0].rhs.op).toBe("sub");
    expect(next.equations[0].rhs.args[0].op).toBe("mul");
    expect(
      next.equations[0].rhs.args[0].args.every(
        (a) => a.var === "unconnected_input",
      ),
    ).toBe(true);
  });
  it("does not guess arithmetic from equation labels or IDs", () => {
    const model = createSampleModel();
    model.equations[0].label = "total + oferta";
    model.equations[0].rhs = ref("A");
    expect(getEquationOperator(model.equations[0])).toBe("mul");
    expect(connectNodes(model, "T_amb", "eq_q").ok).toBe(false);
  });
  it("requires explicit repair of missing operands instead of appending around them", () => {
    const model = createSampleModel();
    const disconnected = disconnectEdge(model, {
      source: "A",
      target: "eq_q",
      relation: "INPUT_TO",
    }).model;
    const result = connectNodes(disconnected, "A", "eq_q");
    expect(result.ok).toBe(false);
    expect(disconnected.equations[0].rhs.args[1].var).toBe("unconnected_input");
  });
  it("requires correct port roles and selected relation", () => {
    const model = createSampleModel();
    expect(resolveConnection(model, "T_amb", "eq_q", 1, 1).ok).toBe(false);
    expect(resolveConnection(model, "T_amb", "eq_q", 1, 0).ok).toBe(true);
    expect(
      resolveConnection(
        model,
        "hip_steady",
        "eq_q",
        undefined,
        undefined,
        "INPUT_TO",
      ).ok,
    ).toBe(false);
  });
  it("rejects self-dependent computation and fixed output values", () => {
    const model = createSampleModel();
    expect(connectNodes(model, "Q", "eq_q").ok).toBe(false);
    const next = createNodeInModel(model, "equation").model;
    expect(connectNodes(next, "eq_1", "T_amb").ok).toBe(false);
    expect(connectNodes(next, "eq_1", "Q").ok).toBe(false);
    expect(() => updateNodeInModel(model, "Q", { value: 10 })).toThrow(
      "calculada",
    );
  });
  it("new quantities have no invented measurements or automatic evidence links", () => {
    const model = createSampleModel();
    const variable = createNodeInModel(model, "variable");
    expect(variable.model.variables.at(-1)?.value).toBeNull();
    const obs = createNodeInModel(model, "observation");
    expect(obs.graph.edges.some((e) => e.target === obs.nodeId)).toBe(false);
  });
  it("validates finite values, tolerances and expression identifiers", () => {
    const model = createSampleModel();
    expect(() =>
      updateNodeInModel(model, "T_amb", { value: Infinity }),
    ).toThrow("finitos");
    expect(() => updateNodeInModel(model, "obs_q", { tolerance: -1 })).toThrow(
      "negativa",
    );
    expect(() =>
      updateNodeInModel(model, "eq_q", { expression: "A * unknown" }),
    ).toThrow("desconhecida");
    expect(() =>
      updateNodeInModel(model, "eq_q", { expression: "__import__('os')" }),
    ).toThrow();
    const bounded = createNodeInModel(model, "variable").model;
    let expr: Expr = ref("A");
    for (let i = 0; i < 12; i++)
      expr = { var: null, op: "mul", args: [expr, ref("T_amb")] };
    bounded.equations[0].rhs = expr;
    const excessive = connectNodes(bounded, "var_1", "eq_q");
    expect(excessive.ok).toBe(false);
    if (!excessive.ok) expect(excessive.reason).toContain("profundidade");
  });
});


it("catalog creation preserves the entered expression and does not invent its output", () => {
  const model = createSampleModel();
  const created = createConfiguredNode(model, "equation", "eq_extra", {
    label: "Verificação adicional", expression: "A * (T_amb - T_amb)",
  });
  const equation = created.model.equations.find((eq) => eq.id === "eq_extra")!;
  expect(equation.lhs).toBe("unconnected_output");
  expect(equation.rhs.op).toBe("mul");
  expect(equation.rhs.args[1].op).toBe("sub");
  expect(extractEquationInputs(equation.rhs)).toEqual(["A", "T_amb"]);
  expect(model.equations).toHaveLength(1);
});

it("catalog rejects duplicate IDs, unknown operands and invalid quantities atomically", () => {
  const model = createSampleModel();
  const original = structuredClone(model);
  expect(() => createConfiguredNode(model, "variable", "A", { label: "Duplicada" })).toThrow();
  expect(() => createConfiguredNode(model, "variable", "1_invalid", { label: "Inválida" })).toThrow();
  expect(() => createConfiguredNode(model, "equation", "eq_extra", { label: "Inválida", expression: "A * ausente" })).toThrow();
  expect(() => createConfiguredNode(model, "variable", "extra", { label: "Inválida", value: Infinity })).toThrow();
  expect(model).toEqual(original);
});
