export interface Expr {
  var: string | null;
  op: "add" | "mul" | "sub" | null;
  args: Expr[];
}
export interface Variable {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  source: string | null;
}
export interface Equation {
  id: string;
  label: string;
  lhs: string;
  rhs: Expr;
  assumption_ids: string[];
  source: string;
}
export interface Model {
  schema_version: 1;
  id: string;
  title: string;
  description: string;
  variables: Variable[];
  equations: Equation[];
  assumptions: { id: string; label: string; justification: string }[];
  requirements: {
    id: string;
    label: string;
    equation_id: string;
    exclusion_reason: string | null;
  }[];
  observations: {
    id: string;
    label: string;
    variable_id: string;
    value: number;
    unit: string;
    tolerance: number;
    source: string;
  }[];
}
export type Kind =
  "variable" | "equation" | "assumption" | "requirement" | "observation";
export interface GraphNode {
  id: string;
  label: string;
  kind: Kind;
  group?: {id:string;members:string[]};
}
export interface Graph {
  preserveIds?:string[];
  nodes: GraphNode[];
  edges: { id: string; source: string; target: string; relation: string; bundle?:string[] }[];
}
export interface LoadedModel {
  model: Model;
  graph: Graph;
}
export interface Example {
  id: string;
  label: string;
  description: string;
}
export interface Check {
  id: string;
  rule_id: string;
  rule_version: number;
  status: "passed" | "failed" | "inconclusive";
  node_ids: string[];
  title: string;
  evidence: string;
  suggested_action: string;
}
export interface Run {
  run_id: string;
  model_revision: string;
  engine_version: string;
  created_at: string;
  outcome: "consistent" | "attention" | "inconclusive";
  counts: { passed: number; failed: number; inconclusive: number };
  checks: Check[];
  values: Record<
    string,
    { value: number; unit: string; origin: string; expression?: string }
  >;
  limitations: string[];
}
