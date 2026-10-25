export interface Preferences {
  language: "pt-BR" | "en";
  theme: "light" | "dark";
  gridStyle: "dots" | "lines" | "none";
  panMode: "space" | "free";
  alwaysShowLabels: boolean;
  selectionColorHex: string;
  selectionHalo: boolean;
  doubleClickAction: "subgraph" | "inspect";
  confirmDeleteWithConnections: boolean;
}

export const PREFERENCES_KEY = "nexo.preferences.v1";
export const DEFAULT_PREFERENCES: Preferences = {
  language: "pt-BR",
  theme: "light", gridStyle: "dots", panMode: "space", alwaysShowLabels: true,
  selectionColorHex: "#e79b42", selectionHalo: false,
  doubleClickAction: "inspect", confirmDeleteWithConnections: true,
};

export function parsePreferences(raw: unknown): Preferences {
  const next = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const value = raw as Record<string, unknown>;
  if (value.language === "pt-BR" || value.language === "en") next.language = value.language;
  if (value.theme === "light" || value.theme === "dark") next.theme = value.theme;
  if (["dots", "lines", "none"].includes(String(value.gridStyle))) next.gridStyle = value.gridStyle as Preferences["gridStyle"];
  if (value.panMode === "space" || value.panMode === "free") next.panMode = value.panMode;
  if (value.doubleClickAction === "subgraph" || value.doubleClickAction === "inspect") next.doubleClickAction = value.doubleClickAction;
  if (typeof value.selectionColorHex === "string" && /^#[0-9a-f]{6}$/i.test(value.selectionColorHex)) next.selectionColorHex = value.selectionColorHex;
  for (const key of ["alwaysShowLabels", "selectionHalo", "confirmDeleteWithConnections"] as const)
    if (typeof value[key] === "boolean") next[key] = value[key];
  return next;
}

export function readPreferences(): Preferences {
  try { return parsePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null")); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

export function savePreferences(value: Preferences): boolean {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(parsePreferences(value))); return true; }
  catch { return false; }
}

// Apply before mounting React, so startup and the first GPU frame use one theme.
export function applyAppearance(value: Preferences) {
  document.documentElement.lang = value.language === "en" ? "en" : "pt-BR";
  document.documentElement.dataset.theme = value.theme;
  document.documentElement.dataset.gridStyle = value.gridStyle;
}
