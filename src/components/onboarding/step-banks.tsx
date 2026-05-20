"use client";

import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { getBanksByCountry, type BankInfo } from "@/data/banks-by-country";
import { BankLogo, BANK_LOGOS } from "@/components/bank-logos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

export function StepBanks({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [customName, setCustomName] = useState("");

  const availableBanks = getBanksByCountry(state.country?.code ?? "ES");
  // Custom banks are those the user added manually — not in the country list
  const customBanks = state.selectedBanks.filter(
    (b) => !availableBanks.some((ab) => ab.slug === b.slug)
  );

  function isSelected(bank: BankInfo) {
    return state.selectedBanks.some((b) => b.slug === bank.slug);
  }

  function toggleBank(bank: BankInfo) {
    const already = isSelected(bank);
    const next = already
      ? state.selectedBanks.filter((b) => b.slug !== bank.slug)
      : [...state.selectedBanks, bank];
    onUpdate({ selectedBanks: next });
  }

  function addCustomBank() {
    const name = customName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const newBank: BankInfo = { slug, name, color: "#6b7280" };
    if (!state.selectedBanks.some((b) => b.slug === slug)) {
      onUpdate({ selectedBanks: [...state.selectedBanks, newBank] });
    }
    setCustomName("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") addCustomBank();
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
        <h2 className="text-2xl font-bold">{t("whatBanksDoYouUse")}</h2>
        <p className="text-sm text-muted-foreground">
          {state.country?.name ?? "Tu país"} — {t("selectAllYouUse")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {availableBanks.map((bank, i) => {
          const selected = isSelected(bank);
          return (
            <button
              key={bank.slug}
              onClick={() => toggleBank(bank)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-colors animate-in fade-in slide-in-from-bottom-2 ${
                selected ? "border-primary bg-accent" : "border-border bg-card"
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {BANK_LOGOS[bank.slug] ? (
                <BankLogo bank={bank.slug} size={36} className="shrink-0" />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
                  style={{ backgroundColor: bank.color }}
                >
                  {bank.name[0]}
                </div>
              )}
              <span className="text-[13px] font-medium truncate flex-1 min-w-0">
                {bank.name}
              </span>
              {selected && (
                <Check
                  className="text-primary animate-in zoom-in shrink-0"
                  size={14}
                />
              )}
            </button>
          );
        })}

        {/* Custom banks added by the user — always selected, appear at the end */}
        {customBanks.map((bank) => (
          <button
            key={bank.slug}
            onClick={() => toggleBank(bank)}
            className="flex items-center gap-2.5 p-3 rounded-xl border-2 border-primary bg-accent text-left transition-colors animate-in zoom-in-95 duration-200"
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
              style={{ backgroundColor: bank.color }}
            >
              {bank.name[0]}
            </div>
            <span className="text-[13px] font-medium truncate flex-1 min-w-0">
              {bank.name}
            </span>
            <Check className="text-primary animate-in zoom-in shrink-0" size={14} />
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t("addCustomBank")}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-11 text-base"
        />
        <Button variant="outline" className="h-11 shrink-0" onClick={addCustomBank}>
          {t("addBank")}
        </Button>
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={state.selectedBanks.length === 0}
        onClick={onNext}
      >
        {t("nextArrow")}
      </Button>

      <button
        className="text-sm text-muted-foreground text-center hover:text-foreground transition-colors"
        onClick={onNext}
      >
        {t("skipThisStep")}
      </button>
    </div>
  );
}
