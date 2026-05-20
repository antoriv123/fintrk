"use client";

import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { useT, useLocaleCode } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

type SummaryRow = {
  label: string;
  value: string | number;
  isAmount?: boolean;
  symbol?: string;
  countryCode?: string;
};

export function StepDone({ state, onBack }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();
  const currencySymbol = state.country?.symbol ?? "$";

  const totalRecurring = state.recurringExpenses.reduce(
    (sum, r) => sum + r.amount,
    0
  );

  const GOAL_LABELS: Record<string, string> = {
    control_spending: t("goalLabelControl"),
    save: t("goalLabelSave"),
    invest: t("goalLabelInvest"),
    debt: t("goalLabelDebt"),
    budget: t("goalLabelBudget"),
  };

  const summaryRows: SummaryRow[] = [
    {
      label: t("summaryCountry"),
      value: state.country ? state.country.name : "—",
      countryCode: state.country?.code,
    },
    {
      label: t("summaryCurrency"),
      value: state.country
        ? `${state.country.currency} ${state.country.symbol}`
        : "—",
    },
    {
      label: t("summaryAccounts"),
      value:
        state.selectedBanks.length > 0
          ? state.selectedBanks.map((b) => b.name).join(", ")
          : "—",
    },
    {
      label: t("summaryGoals"),
      value:
        state.goals.length > 0
          ? state.goals
              .map((id) => GOAL_LABELS[id] ?? id)
              .join(", ")
          : "—",
    },
    {
      label: t("summarySubscriptions"),
      value: `${state.subscriptions.length} ${t("activeSubscriptions")}`,
    },
    {
      label: t("summaryFixedExpenses"),
      value: totalRecurring,
      isAmount: true,
      symbol: currencySymbol,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}
      {/* Big check icon */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="text-primary" size={44} strokeWidth={2.2} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold">{t("yourFintrkIsReady")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("personalizedForYou")}
          </p>
        </div>
      </div>

      {/* Summary rows */}
      <div className="flex flex-col gap-2">
        {summaryRows.map((row, i) => (
          <div
            key={row.label}
            className="flex justify-between items-center px-3.5 py-3 rounded-xl bg-card border border-border text-sm animate-in fade-in slide-in-from-bottom-2"
            style={{
              animationDelay: `${i * 60}ms`,
              animationFillMode: "both",
            }}
          >
            <span className="text-muted-foreground">{row.label}</span>
            {row.isAmount ? (
              <span className="font-semibold text-primary">
                {row.symbol}
                {(row.value as number).toLocaleString(localeCode, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            ) : (
              <span className="font-semibold text-right max-w-[60%] truncate flex items-center gap-2 justify-end">
                {row.countryCode && <CountryFlag code={row.countryCode} size={20} />}
                {row.value as string}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
