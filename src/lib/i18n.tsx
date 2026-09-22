import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import mai from "@/locales/mai.json";

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<string, Dictionary> = { en, hi, mai };
const STORAGE_KEY = "shahin_language";

export const DEFAULT_LANGUAGE = "en";

type I18nValue = {
  language: string;
  setLanguage: (code: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function readStoredLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    setLanguageState(readStoredLanguage());
  }, []);

  const setLanguage = useCallback((code: string) => {
    setLanguageState(code);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, code);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dictionary = DICTIONARIES[language] ?? DICTIONARIES[DEFAULT_LANGUAGE]!;
      let text = dictionary[key] ?? DICTIONARIES[DEFAULT_LANGUAGE]![key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
        }
      }
      return text;
    },
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
