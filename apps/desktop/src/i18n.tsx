import { createContext, useContext, useMemo, type ReactNode } from "react";
import { english } from "./locales/en";

export type Language = "pt-BR" | "en";
export type MessageValues = Record<string, string | number>;
export function createTranslator(language: Language) {
  return (source: string, values: MessageValues = {}): string => {
    const key = source.trim();
    const translated = language === "en" ? english[key] ?? key : key;
    const text = translated.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
      (token, name: string) => Object.hasOwn(values, name)
        ? typeof values[name] === "number" ? formatNumber(values[name], language) : String(values[name])
        : token);
    return (source.match(/^\s*/)?.[0] ?? "") + text + (source.match(/\s*$/)?.[0] ?? "");
  };
}
export function localeFor(language: Language) { return language === "en" ? "en-US" : "pt-BR"; }
export function formatNumber(value: number, language: Language, options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 4, ...options }).format(value);
}
export function formatDate(value: string | Date, language: Language) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "short", timeStyle: "medium",
  }).format(date);
}
function contextValue(language: Language) {
  return { language, locale: localeFor(language), t: createTranslator(language),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, language, options),
    date: (value: string | Date) => formatDate(value, language) };
}
const I18nContext = createContext(contextValue("pt-BR"));
export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => contextValue(language), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() { return useContext(I18nContext); }
