import { describe, it, expect } from "vitest";
import { parseExpr, formatExpr } from "./expression";
import { parseProject, serializeProject, type WorkspaceState } from "./project";
import type { Model } from "./types";
const model: Model = {
  schema_version: 1,
  id: "test",
  title: "Análise térmica",
  description: "Caso de teste",
  variables: [{ id: "A", label: "Entrada", unit: "1", value: 1, source: null }],
  equations: [],
  assumptions: [],
  requirements: [],
  observations: [],
};
const workspace: WorkspaceState = {
  viewport: {
    positions: [{ id: "A", x: 123, y: 456 }],
    camera: { x: 12, y: 23, zoom: 1.25 },
    visibility: {
      variable: true,
      equation: true,
      assumption: false,
      requirement: true,
      observation: true,
    },
  },
  explorer: true,
  inspector: true,
  navigator: true,
  results: true,
};
describe("project persistence", () => {
  it("roundtrips Unicode model, graph positions, camera and panels without accepting saved test verdicts", () => {
    const text = serializeProject(model, workspace, new Date().toISOString());
    const parsed = parseProject(text);
    expect(parsed.model).toEqual(model);
    expect(parsed.document?.workspace).toEqual(workspace);
    expect(JSON.parse(text).run).toBeUndefined();
  });
  it("accepts a legacy model without interpreting it as a project", () => {
    expect(parseProject(JSON.stringify(model)).document).toBeNull();
  });
  it("rejects unknown versions, oversized projects and invalid views", () => {
    const original = JSON.parse(
      serializeProject(model, workspace, new Date().toISOString()),
    );
    expect(() =>
      parseProject(JSON.stringify({ ...original, version: 2 })),
    ).toThrow("versão");
    expect(() => parseProject(" ".repeat(2_000_001))).toThrow("2 MB");
    original.workspace.viewport.camera.zoom = -1;
    expect(() => parseProject(JSON.stringify(original))).toThrow("Câmera");
  });
  it("rejects duplicated positions and missing visibility types", () => {
    const original = JSON.parse(
      serializeProject(model, workspace, new Date().toISOString()),
    );
    original.workspace.viewport.positions.push(
      original.workspace.viewport.positions[0],
    );
    expect(() => parseProject(JSON.stringify(original))).toThrow("Posições");
    original.workspace.viewport.positions.pop();
    delete original.workspace.viewport.visibility.equation;
    expect(() => parseProject(JSON.stringify(original))).toThrow(
      "Visibilidade",
    );
  });
});
describe("restricted equation grammar", () => {
  it("preserves precedence, parentheses, repeated operands and subtraction order", () => {
    const vars = new Set(["A", "B", "C"]);
    const expr = parseExpr("A * (B - C) + A", vars);
    expect(formatExpr(expr)).toBe("((A * (B - C)) + A)");
    expect(parseExpr(formatExpr(expr), vars)).toEqual(expr);
  });
  it("rejects code, undeclared symbols and excessive nesting", () => {
    const vars = new Set(["A"]);
    for (const text of [
      "alert(A)",
      "A / A",
      "1",
      "B",
      "(".repeat(14) + "A" + ")".repeat(14),
    ])
      expect(() => parseExpr(text, vars)).toThrow();
  });
});
