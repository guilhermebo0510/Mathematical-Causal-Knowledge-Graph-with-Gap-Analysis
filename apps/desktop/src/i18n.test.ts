import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";
import { createTranslator, formatDate, formatNumber } from "./i18n";
import { english } from "./locales/en";
import { parsePreferences } from "./preferences";

test("language interpolation preserves project text, IDs and expressions", () => {
  const en = createTranslator("en"), pt = createTranslator("pt-BR");
  expect(en("Projeto: {p0}", { p0: "Salvar projeto" })).toBe("Project: Salvar projeto");
  expect(en("  Propriedades ")).toBe("  Properties ");
  expect(pt("Projeto: {p0}", { p0: "New project" })).toBe("Projeto: New project");
  expect(en("U * (A - A)")).toBe("U * (A - A)");
  expect(en("{unknown}")).toBe("{unknown}");
  expect(parsePreferences({ language: "en" }).language).toBe("en");
  expect(parsePreferences({ language: "unrecognized" }).language).toBe("pt-BR");
});

test("display numbers and dates follow the selected locale", () => {
  expect(formatNumber(1234.5, "pt-BR")).toBe("1.234,5");
  expect(formatNumber(1234.5, "en")).toBe("1,234.5");
  expect(formatDate("2026-06-15T12:00:00Z", "en")).not.toBe(formatDate("2026-06-15T12:00:00Z", "pt-BR"));
});

test("English translations preserve every named interpolation parameter", () => {
  const names = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort();
  for (const [source, translated] of Object.entries(english))
    expect(names(translated), source).toEqual(names(source));
});

test("all static application translation calls have an English entry", () => {
  const missing: string[] = [];
  for (const file of ["App.tsx", "ProposalReview.tsx", "ProposalJournalView.tsx", "DesktopProposalInbox.tsx", "GraphView.tsx", "Inspector.tsx", "ResultsDock.tsx", "RunHistory.tsx", "GraphNavigator.tsx", "SettingsPanel.tsx", "viewportEngine.ts"]) {
    const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const key = node.arguments[0];
        if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) && !Object.hasOwn(english, key.text.trim()))
          missing.push(`${file}: ${key.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(missing).toEqual([]);
});
