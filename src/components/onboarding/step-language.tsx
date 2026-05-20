"use client";

import { Globe } from "lucide-react";
import { setStoredLocale } from "@/lib/i18n";
import { CountryFlag } from "@/components/country-flag";
import type { OnboardingStepProps } from "./types";

const LANGUAGES = [
  { code: "es" as const, label: "Español", flagCode: "ES", desc: "Configura tu cuenta en español" },
  { code: "en" as const, label: "English", flagCode: "GB", desc: "Set up your account in English" },
];

export function StepLanguage({ onNext, onUpdate }: OnboardingStepProps) {
  function selectLanguage(lang: "es" | "en") {
    setStoredLocale(lang);
    onUpdate({ language: lang });
    onNext();
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-400 flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-accent flex items-center justify-center">
        <Globe className="text-primary" size={36} />
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">Choose your language</h1>
        <p className="text-muted-foreground text-sm">Elige tu idioma</p>
      </div>

      <div className="w-full flex flex-col gap-3">
        {LANGUAGES.map((lang, i) => (
          <button
            key={lang.code}
            onClick={() => selectLanguage(lang.code)}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-border bg-card text-left transition-all hover:border-primary/50 active:scale-[0.98] animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CountryFlag code={lang.flagCode} size={44} />

            <div className="flex-1">
              <p className="text-lg font-bold">{lang.label}</p>
              <p className="text-xs text-muted-foreground">{lang.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
