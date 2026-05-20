"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { useT, useLocaleCode } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/components/fetch-error";
import { getCurrencySymbol } from "@/lib/currency";

interface MonthData {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  byCategory: { category: string; total: number }[];
}

interface CategoryChange {
  category: string;
  month1: number;
  month2: number;
  change: number;
  direction: "up" | "down" | "same";
}

interface CompareData {
  month1: MonthData;
  month2: MonthData;
  changes: CategoryChange[];
}

function getDefaultMonths(): { month1: string; month2: string } {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  return { month1: prev, month2: current };
}

const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMonth(month: string, t: (key: any) => string): string {
  const [year, mon] = month.split("-");
  return `${t(MONTH_KEYS[parseInt(mon) - 1])} ${year}`;
}

function DirectionArrow({ direction }: { direction: "up" | "down" | "same" }) {
  if (direction === "up") return <span className="text-expense">↑</span>;
  if (direction === "down") return <span className="text-income">↓</span>;
  return <span className="text-muted-foreground">—</span>;
}

function SummaryCard({
  label,
  value1,
  value2,
  colorClass1,
  colorClass2,
  arrow,
  label1,
  label2,
  sym,
  fmtInt,
}: {
  label: string;
  value1: number;
  value2: number;
  colorClass1: string;
  colorClass2: string;
  arrow: "up" | "down" | "same";
  label1: string;
  label2: string;
  sym: string;
  fmtInt: (n: number) => string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-muted-foreground text-[10px] tracking-wide mb-2">{label.toUpperCase()}</div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[9px] text-muted-foreground mb-0.5">{label1}</div>
            <div className={`text-lg font-bold ${colorClass1}`}>
              {sym}{fmtInt(value1)}
            </div>
          </div>
          <div className="text-xl pb-1">
            <DirectionArrow direction={arrow} />
          </div>
          <div className="text-right">
            <div className="text-[9px] text-muted-foreground mb-0.5">{label2}</div>
            <div className={`text-lg font-bold ${colorClass2}`}>
              {sym}{fmtInt(value2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol("EUR");
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);
  const defaults = getDefaultMonths();
  const [month1, setMonth1] = useState(defaults.month1);
  const [month2, setMonth2] = useState(defaults.month2);

  const { data, loading, error, refresh } = useFetch<CompareData>(
    `/api/compare?month1=${month1}&month2=${month2}`
  );

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  const allCategories = data?.changes ?? [];
  const maxBar = allCategories.length > 0
    ? Math.max(...allCategories.map((c) => Math.max(c.month1, c.month2)), 1)
    : 1;

  const incomeArrow: "up" | "down" | "same" = !data
    ? "same"
    : data.month2.income > data.month1.income
    ? "up"
    : data.month2.income < data.month1.income
    ? "down"
    : "same";

  const expensesArrow: "up" | "down" | "same" = !data
    ? "same"
    : data.month2.expenses > data.month1.expenses
    ? "up"
    : data.month2.expenses < data.month1.expenses
    ? "down"
    : "same";

  const savingsArrow: "up" | "down" | "same" = !data
    ? "same"
    : data.month2.savings > data.month1.savings
    ? "up"
    : data.month2.savings < data.month1.savings
    ? "down"
    : "same";

  return (
    <div className="animate-in flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{t("compareMonths")}</h1>
        <p className="text-sm text-muted-foreground">{t("compareDesc")}</p>
      </div>

      {/* Month pickers */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-2">{t("month1Label")}</div>
            <input
              type="month"
              value={month1}
              onChange={(e) => setMonth1(e.target.value)}
              className="w-full bg-transparent text-foreground text-sm font-semibold outline-none cursor-pointer"
            />
            {data && (
              <div className="text-[11px] text-muted-foreground mt-1">{formatMonth(data.month1.month, t)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-2">{t("month2Label")}</div>
            <input
              type="month"
              value={month2}
              onChange={(e) => setMonth2(e.target.value)}
              className="w-full bg-transparent text-foreground text-sm font-semibold outline-none cursor-pointer"
            />
            {data && (
              <div className="text-[11px] text-muted-foreground mt-1">{formatMonth(data.month2.month, t)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label={t("incomeLabel2")}
              value1={data.month1.income}
              value2={data.month2.income}
              colorClass1="text-income"
              colorClass2="text-income"
              arrow={incomeArrow}
              label1={t("month1Short")}
              label2={t("month2Short")} sym={sym} fmtInt={fmtInt}
            />
            <SummaryCard
              label={t("expensesLabel")}
              value1={data.month1.expenses}
              value2={data.month2.expenses}
              colorClass1="text-expense"
              colorClass2="text-expense"
              arrow={expensesArrow}
              label1={t("month1Short")}
              label2={t("month2Short")} sym={sym} fmtInt={fmtInt}
            />
            <SummaryCard
              label={t("savingsLabel")}
              value1={data.month1.savings}
              value2={data.month2.savings}
              colorClass1={data.month1.savings >= 0 ? "text-primary" : "text-expense"}
              colorClass2={data.month2.savings >= 0 ? "text-primary" : "text-expense"}
              arrow={savingsArrow}
              label1={t("month1Short")}
              label2={t("month2Short")} sym={sym} fmtInt={fmtInt}
            />
          </div>

          {/* Bar chart — grouped by category */}
          {allCategories.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="text-muted-foreground text-[10px] tracking-wide mb-4">
                  {t("expensesByCategory")}
                </div>
                <div className="flex items-end gap-2 h-44 overflow-x-auto">
                  {allCategories.map((cat) => {
                    const h1 = Math.round((cat.month1 / maxBar) * 100);
                    const h2 = Math.round((cat.month2 / maxBar) * 100);
                    return (
                      <div
                        key={cat.category}
                        className="flex flex-col items-center gap-0.5 flex-shrink-0 group relative"
                        style={{ minWidth: "3rem" }}
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-muted text-[10px] text-muted-foreground rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                          <div className="font-semibold mb-0.5">{cat.category}</div>
                          <div>M1: {sym}{fmtInt(cat.month1)}</div>
                          <div>M2: {sym}{fmtInt(cat.month2)}</div>
                        </div>
                        {/* Grouped bars */}
                        <div className="flex items-end gap-px h-36 w-full">
                          <div
                            className="flex-1 rounded-t transition-all bg-primary"
                            style={{
                              height: `${h1}%`,
                              opacity: 0.7,
                              minHeight: cat.month1 > 0 ? "2px" : "0",
                            }}
                          />
                          <div
                            className="flex-1 rounded-t transition-all bg-red-500"
                            style={{
                              height: `${h2}%`,
                              opacity: 0.7,
                              minHeight: cat.month2 > 0 ? "2px" : "0",
                            }}
                          />
                        </div>
                        <span className="text-[8px] text-muted-foreground mt-1 text-center leading-tight max-w-12 truncate w-full">
                          {cat.category}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm bg-primary opacity-70" />
                    <span>{formatMonth(month1, t)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm bg-red-500 opacity-70" />
                    <span>{formatMonth(month2, t)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Changes table */}
          {allCategories.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="text-muted-foreground text-[10px] tracking-wide mb-3">{t("categoryDetail")}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-[10px] tracking-wide">
                        <th className="text-left pb-2">{t("categoryHeader")}</th>
                        <th className="text-right pb-2">{formatMonth(month1, t).toUpperCase()}</th>
                        <th className="text-right pb-2">{formatMonth(month2, t).toUpperCase()}</th>
                        <th className="text-right pb-2">{t("changeHeader")}</th>
                        <th className="text-center pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCategories.map((cat) => (
                        <tr
                          key={cat.category}
                          className="border-t border-border"
                        >
                          <td className="py-2 text-foreground">{cat.category}</td>
                          <td className="py-2 text-right text-foreground">
                            {cat.month1 > 0 ? `${sym}${fmtInt(cat.month1)}` : "—"}
                          </td>
                          <td className="py-2 text-right text-foreground">
                            {cat.month2 > 0 ? `${sym}${fmtInt(cat.month2)}` : "—"}
                          </td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              cat.direction === "up"
                                ? "text-expense"
                                : cat.direction === "down"
                                ? "text-income"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cat.direction !== "same"
                              ? `${cat.direction === "up" ? "+" : ""}${cat.change}%`
                              : "—"}
                          </td>
                          <td className="py-2 text-center">
                            <DirectionArrow direction={cat.direction} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {allCategories.length === 0 && (
            <div className="text-center text-muted-foreground py-10">
              {t("noDataForMonths")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
