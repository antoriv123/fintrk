import es from "./es.json";
import en from "./en.json";

export type Locale = "es" | "en";

export type Translations = typeof es;

const translations: Record<Locale, Translations> = { es, en };

export const LOCALES: Locale[] = ["es", "en"];

export const LOCALE_LABELS: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

/** ISO 3166-1 alpha-2 country code that maps to each locale. Used for flags. */
export const LOCALE_FLAGS: Record<Locale, string> = {
  es: "ES",
  en: "GB",
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale];
}
