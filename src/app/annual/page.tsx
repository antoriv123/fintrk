"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { useT, useLocaleCode } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/components/fetch-error";
import { getCurrencySymbol } from "@/lib/currency";

interface MonthData {
  month: string;
  label: string;
  income: number;
  expenses: number;
  savings: number;
}

interface AnnualData {
  year: number;
  months: MonthData[];
  totals: { income: number; expenses: number; savings: number };
  categoryTotals: { category: string; total: number }[];
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  currency?: string;
}

export default function AnnualPage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, error, refresh } = useFetch<AnnualData>(`/api/annual?year=${year}`);
  const sym = getCurrencySymbol(data?.currency ?? "EUR");
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const avgSavingsRate =
    data.avgMonthlyIncome > 0
      ? Math.round(((data.avgMonthlyIncome - data.avgMonthlyExpenses) / data.avgMonthlyIncome) * 100)
      : 0;

  const maxBar = Math.max(...data.months.map((m) => Math.max(m.income, m.expenses)), 1);
  const maxCategory = data.categoryTotals.length > 0 ? data.categoryTotals[0].total : 1;

  return (
    <div className="animate-in flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">{t("annualSummary")}</h1>
        <p className="text-sm text-muted-foreground">{t("annualDesc")}</p>
      </div>

      {/* Year navigation */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setYear((y) => y - 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90">
          <span className="text-lg">‹</span>
        </button>
        <button onClick={() => setYear(currentYear)}
          className={`px-5 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 ${
            year === currentYear ? "bg-[#2D6A4F]/15 text-[#2D6A4F]" : "bg-muted/60 text-foreground hover:bg-muted"
          }`}>
          {year}
        </button>
        <button onClick={() => setYear((y) => y + 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90">
          <span className="text-lg">›</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <p className="text-[10px] text-muted-foreground tracking-wide mb-1">{t("totalIncome")}</p>
          <p className="text-xl font-bold text-[#2D6A4F]">{sym}{fmtInt(data.totals.income)}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <p className="text-[10px] text-muted-foreground tracking-wide mb-1">{t("totalExpenses")}</p>
          <p className="text-xl font-bold text-red-400">{sym}{fmtInt(data.totals.expenses)}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <p className="text-[10px] text-muted-foreground tracking-wide mb-1">{t("totalSaved2")}</p>
          <p className={`text-xl font-bold ${data.totals.savings >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
            {data.totals.savings >= 0 ? "+" : ""}{sym}{fmtInt(data.totals.savings)}
          </p>
        </div>
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
          <p className="text-[10px] text-muted-foreground tracking-wide mb-1">{t("savingsRate")}</p>
          <p className={`text-xl font-bold ${avgSavingsRate >= 20 ? "text-[#2D6A4F]" : avgSavingsRate >= 10 ? "text-amber-400" : "text-red-400"}`}>
            {avgSavingsRate}%
          </p>
        </div>
      </div>

      {/* Stacked bar chart — income vs expenses per month */}
      <div className="rounded-2xl bg-card border border-border shadow-sm">
        <div className="p-4">
          <div className="text-muted-foreground text-[10px] tracking-wide mb-4">{t("incomeVsExpenses")}</div>
          <div className="flex items-end gap-1 h-40">
            {data.months.map((m) => {
              const incomeH = Math.round((m.income / maxBar) * 100);
              const expensesH = Math.round((m.expenses / maxBar) * 100);
              const hasData = m.income > 0 || m.expenses > 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  {/* Tooltip */}
                  {hasData && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-muted text-[10px] text-muted-foreground rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="text-income">+{sym}{fmtInt(m.income)}</div>
                      <div className="text-expense">-{sym}{fmtInt(m.expenses)}</div>
                      <div className={m.savings >= 0 ? "text-primary" : "text-expense"}>={m.savings >= 0 ? "+" : ""}{sym}{fmtInt(m.savings)}</div>
                    </div>
                  )}
                  {/* Bars */}
                  <div className="w-full flex items-end gap-px h-32">
                    <div
                      className={`flex-1 rounded-t transition-all ${!hasData ? "bg-muted" : ""}`}
                      style={{
                        height: `${incomeH}%`,
                        backgroundColor: hasData ? "#16a34a" : undefined,
                        opacity: hasData ? 0.85 : 0.3,
                        minHeight: hasData && m.income > 0 ? "2px" : "0",
                      }}
                    />
                    <div
                      className={`flex-1 rounded-t transition-all ${!hasData ? "bg-muted" : ""}`}
                      style={{
                        height: `${expensesH}%`,
                        backgroundColor: hasData ? "#ef4444" : undefined,
                        opacity: hasData ? 0.85 : 0.3,
                        minHeight: hasData && m.expenses > 0 ? "2px" : "0",
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1">{m.label}</span>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-green-600" />
              <span>{t("incomeLabel2")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
              <span>{t("expensesLabel")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {data.categoryTotals.length > 0 && (
        <div className="rounded-2xl bg-card border border-border shadow-sm">
          <div className="p-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-3">{t("expensesByCategory")} — {year}</div>
            <div className="flex flex-col gap-3">
              {data.categoryTotals.map((row) => {
                const pct = Math.round((row.total / maxCategory) * 100);
                const totalPct =
                  data.totals.expenses > 0 ? Math.round((row.total / data.totals.expenses) * 100) : 0;
                return (
                  <div key={row.category} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-sm text-muted-foreground truncate">{row.category}</div>
                    <div className="flex-1">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-red-500"
                          style={{ width: `${pct}%`, opacity: 0.8 }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm font-semibold text-expense shrink-0">
                      {sym}{fmtInt(row.total)}
                    </div>
                    <div className="w-8 text-right text-[10px] text-muted-foreground shrink-0">{totalPct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Monthly details table */}
      <div className="rounded-2xl bg-card border border-border shadow-sm">
        <div className="p-4">
          <div className="text-muted-foreground text-[10px] tracking-wide mb-3">{t("monthlyDetail")}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-[10px] tracking-wide">
                  <th className="text-left pb-2">{t("monthHeader")}</th>
                  <th className="text-right pb-2">{t("totalIncome")}</th>
                  <th className="text-right pb-2">{t("totalExpenses")}</th>
                  <th className="text-right pb-2">{t("savingsHeader")}</th>
                  <th className="text-right pb-2">{t("rateHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => {
                  const rate = m.income > 0 ? Math.round((m.savings / m.income) * 100) : 0;
                  const hasData = m.income > 0 || m.expenses > 0;
                  return (
                    <tr
                      key={m.month}
                      className={`border-t border-border ${!hasData ? "opacity-40" : ""}`}
                    >
                      <td className="py-2 text-muted-foreground">{m.label}</td>
                      <td className="py-2 text-right text-income">
                        {m.income > 0 ? `${sym}${fmtInt(m.income)}` : "—"}
                      </td>
                      <td className="py-2 text-right text-expense">
                        {m.expenses > 0 ? `${sym}${fmtInt(m.expenses)}` : "—"}
                      </td>
                      <td className={`py-2 text-right ${hasData ? (m.savings >= 0 ? "text-income" : "text-expense") : "text-muted-foreground"}`}>
                        {hasData ? `${m.savings >= 0 ? "+" : ""}${sym}${fmtInt(m.savings)}` : "—"}
                      </td>
                      <td className={`py-2 text-right ${
                        hasData
                          ? rate >= 20
                            ? "text-income"
                            : rate >= 10
                            ? "text-yellow-500"
                            : "text-expense"
                          : "text-muted-foreground"
                      }`}>
                        {hasData ? `${rate}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="pt-3 pb-1 text-muted-foreground">{t("total")}</td>
                  <td className="pt-3 pb-1 text-right text-income">{sym}{fmtInt(data.totals.income)}</td>
                  <td className="pt-3 pb-1 text-right text-expense">{sym}{fmtInt(data.totals.expenses)}</td>
                  <td className={`pt-3 pb-1 text-right ${data.totals.savings >= 0 ? "text-income" : "text-expense"}`}>
                    {data.totals.savings >= 0 ? "+" : ""}{sym}{fmtInt(data.totals.savings)}
                  </td>
                  <td className={`pt-3 pb-1 text-right ${avgSavingsRate >= 20 ? "text-income" : avgSavingsRate >= 10 ? "text-yellow-500" : "text-expense"}`}>
                    {avgSavingsRate}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border shadow-sm">
          <div className="p-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("avgMonthlyIncome")}</div>
            <div className="text-xl font-bold text-income">{sym}{fmtInt(data.avgMonthlyIncome)}</div>
          </div>
        </div>
        <div className="rounded-2xl bg-card border border-border shadow-sm">
          <div className="p-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("avgMonthlyExpenses")}</div>
            <div className="text-xl font-bold text-expense">{sym}{fmtInt(data.avgMonthlyExpenses)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

