import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { ptBR } from "./pt-BR";
import type { Locale, TranslationDict, TranslationParams, TranslationValue } from "./types";

const STORAGE_KEY = "netops-locale";
const DEFAULT_LOCALE: Locale = "pt-BR";

const dictionaries: Record<Locale, TranslationDict> = {
  "pt-BR": ptBR,
  en,
};

function getNestedValue(dict: TranslationDict, key: string): string | undefined {
  const value = key.split(".").reduce<TranslationValue | undefined>((current, part) => {
    if (current == null || typeof current === "string") return undefined;
    return current[part];
  }, dict);

  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (result, [paramKey, paramValue]) => result.replaceAll(`{{${paramKey}}}`, String(paramValue)),
    template,
  );
}

export function getStoredLocale(): Locale {
  return readStoredLocale();
}

export function translate(locale: Locale, key: string, params?: TranslationParams): string {
  const value = getNestedValue(dictionaries[locale], key) ?? getNestedValue(dictionaries[DEFAULT_LOCALE], key);
  if (!value) return key;
  return interpolate(value, params);
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en" || stored === "pt-BR" ? stored : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    localStorage.setItem(STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback((key: string, params?: TranslationParams) => translate(locale, key, params), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within I18nProvider");
  }
  return context;
}

export function useLocale() {
  return useTranslation().locale;
}
