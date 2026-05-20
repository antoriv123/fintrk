"use client";

import { createContext, useContext } from "react";
import { es, type TranslationKey } from "./es";
import { en } from "./en";

export type Locale = "es" | "en";

const translations: Record<Locale, Record<TranslationKey, string>> = { es, en };

const I18nContext = createContext<Locale>("es");

export const I18nProvider = I18nContext.Provider;

export function useLocale(): Locale {
  return useContext(I18nContext);
}

export function useT(): (key: TranslationKey) => string {
  const locale = useContext(I18nContext);
  return (key: TranslationKey) => translations[locale]?.[key] ?? translations.es[key] ?? key;
}

// For server-side or non-component usage
export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] ?? translations.es[key] ?? key;
}

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "es";
  const stored = localStorage.getItem("fintrk_locale");
  if (stored === "en" || stored === "es") return stored;
  // Auto-detect from browser
  const browserLang = navigator.language.slice(0, 2);
  return browserLang === "en" ? "en" : "es";
}

export function setStoredLocale(locale: Locale): void {
  localStorage.setItem("fintrk_locale", locale);
}

export function useLocaleCode(): string {
  const locale = useContext(I18nContext);
  return locale === "en" ? "en-US" : "es-ES";
}
