"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { COUNTRIES, getTopCountries, type CountryInfo } from "@/data/banks-by-country";
import { CountryFlag } from "@/components/country-flag";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

export function StepCountry({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const lang = state.language ?? "es";

  useEffect(() => {
    const controller = new AbortController();

    // Fallback desde locale / timezone del navegador antes de que llegue IP-API.
    // Si IP-API no llega (bloqueado, offline), seguimos teniendo un default decente.
    const fallback = (() => {
      if (typeof navigator === "undefined") return null;
      const lang = navigator.language || "";
      const m = lang.match(/[a-z]{2,3}-([A-Z]{2})/);
      if (m) return m[1];
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        if (tz.includes("Madrid") || tz.includes("Canary")) return "ES";
        if (tz.includes("Mexico")) return "MX";
        if (tz.includes("Buenos_Aires") || tz.includes("Cordoba")) return "AR";
        if (tz.includes("Bogota") || tz.includes("Lima") || tz.includes("Santiago")) return "CO";
        if (tz.includes("Amsterdam") || tz.includes("Rotterdam")) return "NL";
        if (tz.includes("Paris")) return "FR";
        if (tz.includes("Berlin")) return "DE";
        if (tz.includes("Lisbon")) return "PT";
        if (tz.includes("New_York") || tz.includes("Chicago") || tz.includes("Los_Angeles")) return "US";
      } catch { /* ignore */ }
      return null;
    })();

    if (fallback && !state.country) {
      const fMatch = COUNTRIES.find((c) => c.code === fallback);
      if (fMatch) {
        setDetectedCode(fMatch.code);
        onUpdate({ country: fMatch });
      }
    }

    fetch("https://ip-api.com/json/?fields=countryCode", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const match = COUNTRIES.find((c) => c.code === data.countryCode);
        if (match) {
          setDetectedCode(match.code);
          // Auto-select detected country only if user hasn't selected one yet
          if (!state.country) {
            onUpdate({ country: match });
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topCountries = getTopCountries(lang, detectedCode ?? state.country?.code);

  const filteredAll = search.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  function selectCountry(c: CountryInfo) {
    onUpdate({ country: c, selectedBanks: [] });
  }

  return (
    <div className="flex flex-col gap-5">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold">{t("whereDoYouLive")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("showLocalBanks")}
        </p>
      </div>

      {detectedCode && state.country?.code === detectedCode && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent text-primary text-[11px] font-semibold self-start">
          {t("autoDetected")}
        </span>
      )}

      {/* Top 5 countries */}
      <div className="flex flex-col gap-2">
        {topCountries.map((c, i) => {
          const isSelected = state.country?.code === c.code;
          return (
            <button
              key={c.code}
              onClick={() => selectCountry(c)}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors animate-in fade-in slide-in-from-bottom-2 ${
                isSelected
                  ? "border-primary bg-accent"
                  : "border-border bg-card"
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <CountryFlag code={c.code} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px]">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.currency} ({c.symbol})
                </p>
              </div>
              {isSelected && (
                <Check
                  className="text-primary animate-in zoom-in shrink-0"
                  size={18}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Expandable: all countries */}
      {!showAll ? (
        <button
          onClick={() => setShowAll(true)}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
        >
          <ChevronDown size={16} />
          {t("showAllCountries")}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            placeholder={t("searchCountry")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 text-base"
            autoFocus
          />
          <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto rounded-xl border border-border bg-card p-1.5">
            {filteredAll.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                —
              </p>
            ) : (
              filteredAll.map((c) => {
                const isSelected = state.country?.code === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => selectCountry(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-accent"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <CountryFlag code={c.code} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.currency} ({c.symbol})
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="text-primary shrink-0" size={16} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!state.country}
        onClick={onNext}
      >
        {t("next")} →
      </Button>
    </div>
  );
}
