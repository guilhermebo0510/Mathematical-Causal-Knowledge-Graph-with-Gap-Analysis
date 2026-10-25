import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, parsePreferences, readPreferences, savePreferences } from "./preferences";

afterEach(() => vi.unstubAllGlobals());

test("corrupt or obsolete preferences cannot inject unsupported controls or colors", () => {
  expect(parsePreferences({ theme: "navy", gridStyle: "invalid", selectionColorHex: "url(x)", selectionHalo: "false", engineTimeoutMs: 1 }))
    .toEqual(DEFAULT_PREFERENCES);
  vi.stubGlobal("localStorage", { getItem: () => "{invalid" });
  expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
});

test("supported preferences round trip and storage failure is explicit", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) });
  const next = { ...DEFAULT_PREFERENCES, theme: "dark" as const, gridStyle: "none" as const, selectionHalo: true };
  expect(savePreferences(next)).toBe(true);
  expect(data.has(PREFERENCES_KEY)).toBe(true);
  expect(readPreferences()).toEqual(next);
  vi.stubGlobal("localStorage", { setItem: () => { throw Error("unavailable"); } });
  expect(savePreferences(next)).toBe(false);
});
