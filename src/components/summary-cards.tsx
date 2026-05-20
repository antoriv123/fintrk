"use client";
import { Card, CardContent } from "@/components/ui/card";
import { useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";
import type { Summary } from "@/lib/queries";

interface SummaryCardsProps {
  data: Summary;
  currency?: string | null;
}

const colorMap: Record<string, string> = {
  necesario: "#22c55e",
  negocio: "#3b82f6",
  discrecional: "#f59e0b",
};

function DistributionCard({ data }: { data: Summary }) {
  const total = data.expenses || 1;
  const types = data.byExpenseType.map((et) => ({
    ...et,
    pct: Math.round((et.total / total) * 100),
  }));

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground tracking-wide mb-2">DISTRIBUCIÓN</p>
        <div className="flex flex-col gap-2">
          {types.map((t) => (
            <div key={t.expense_type}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{t.expense_type}</span>
                <span style={{ color: colorMap[t.expense_type] }}>{t.pct}%</span>
              </div>
              <div className="bg-muted rounded h-1.5">
                <div
                  className="rounded h-1.5 transition-all"
                  style={{ width: `${t.pct}%`, backgroundColor: colorMap[t.expense_type] }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ data, currency }: SummaryCardsProps) {
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol(currency);
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);
  return (
    <div className="mb-4">
      {/* Income + Expenses side by side on mobile */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground tracking-wide mb-1">INGRESOS</p>
            <p className="text-income text-xl sm:text-2xl font-bold">{sym}{fmtInt(data.income)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground tracking-wide mb-1">GASTOS</p>
            <p className="text-expense text-xl sm:text-2xl font-bold">{sym}{fmtInt(data.expenses)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top categories + Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.byCategory.length > 0 && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs text-muted-foreground tracking-wide mb-2">TOP GASTOS</p>
              {data.byCategory.slice(0, 3).map((c) => (
                <div key={c.category} className="flex justify-between text-xs mt-1">
                  <span className="text-muted-foreground">{c.category}</span>
                  <span>{sym}{fmtInt(c.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <DistributionCard data={data} />
      </div>
    </div>
  );
}
