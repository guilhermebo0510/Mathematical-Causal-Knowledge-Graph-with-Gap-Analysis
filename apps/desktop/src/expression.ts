import type { Expr } from "./types";

export function formatExpr(expr: Expr): string {
  if (expr.var !== null)
    return expr.var === "unconnected_input" ? "?" : expr.var;
  const operator =
    expr.op === "add" ? " + " : expr.op === "sub" ? " - " : " * ";
  return "(" + expr.args.map(formatExpr).join(operator) + ")";
}

// Restricted grammar only: identifiers, +, -, *, parentheses. Never evaluates code.
export function parseExpr(text: string, variables: Set<string>): Expr {
  if (text.length > 4000) throw new Error("Expressão excede 4.000 caracteres.");
  const tokens =
    text.replaceAll("·", "*").match(/[a-zA-Z][a-zA-Z0-9_]*|[()+*\-]|\S/g) ?? [];
  let pos = 0,
    terms = 0;
  const operation = (op: "add" | "sub" | "mul", a: Expr, b: Expr): Expr => ({
    var: null,
    op,
    args: [a, b],
  });
  function atom(depth: number): Expr {
    if (++terms > 1000 || depth > 12)
      throw new Error("Expressão excede os limites de complexidade.");
    const token = tokens[pos++];
    if (token === "(") {
      const expr = sum(depth + 1);
      if (tokens[pos++] !== ")")
        throw new Error("Feche os parênteses da expressão.");
      return expr;
    }
    if (!token || !variables.has(token))
      throw new Error(
        `Variável desconhecida: ${token ?? "fim da expressão"}. Use os identificadores do projeto.`,
      );
    return { var: token, op: null, args: [] };
  }
  function product(depth: number): Expr {
    let result = atom(depth);
    while (tokens[pos] === "*") {
      pos++;
      result = operation("mul", result, atom(depth));
    }
    return result;
  }
  function sum(depth: number): Expr {
    let result = product(depth);
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++] === "+" ? "add" : "sub";
      result = operation(op, result, product(depth));
    }
    return result;
  }
  const result = sum(0);
  if (pos !== tokens.length)
    throw new Error("Use somente variáveis, +, -, * e parênteses.");
  // Left-associative input can create deep ASTs even without explicit parentheses.
  function check(node: Expr, depth = 0): void {
    if (depth > 12)
      throw new Error("Expressão excede a profundidade máxima de 12.");
    node.args.forEach((arg) => check(arg, depth + 1));
  }
  check(result);
  return result;
}

export function replaceInput(expr: Expr, variable: string): Expr {
  if (expr.var !== null)
    return expr.var === variable
      ? { var: "unconnected_input", op: null, args: [] }
      : expr;
  return { ...expr, args: expr.args.map((arg) => replaceInput(arg, variable)) };
}
