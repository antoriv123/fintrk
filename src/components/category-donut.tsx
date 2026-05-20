"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Card, CardContent } from "@/components/ui/card";
import { useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";

interface CategoryDonutProps {
  data: { category: string; total: number }[];
  totalExpenses: number;
  currency?: string | null;
}

export function CategoryDonut({ data, totalExpenses, currency }: CategoryDonutProps) {
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol(currency);
  const fmt2 = (n: number) =>
    n.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);
  const filtered = data.filter((d) => d.total > 0);

  if (filtered.length === 0) return null;

  const chartData = filtered.map((d) => {
    const info = getCategoryInfo(d.category);
    return {
      name: info.label,
      value: Math.round(d.total * 100) / 100,
      color: info.color,
      icon: info.icon,
    };
  });

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[10px] tracking-wide mb-3">
          GASTOS POR CATEGORÍA
        </p>

        <div className="flex flex-col items-center">
          <div className="relative w-full" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="transparent"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                  labelStyle={{ color: "var(--color-muted-foreground)" }}
                  formatter={(value) => [`${sym}${fmt2(Number(value))}`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] text-muted-foreground tracking-wide">TOTAL</div>
              <div className="text-lg font-bold tabular-nums">
                {sym}{fmtInt(totalExpenses)}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="w-full mt-2 flex flex-col gap-1.5">
            {chartData.map((entry, i) => {
              const pct =
                totalExpenses > 0
                  ? Math.round((entry.value / totalExpenses) * 100)
                  : 0;
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: entry.color }}
                    />
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CategoryIcon icon={entry.icon} color={entry.color} size="sm" withBackground={false} /> {entry.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{pct}%</span>
                    <span className="font-medium tabular-nums">
                      {sym}{fmt2(entry.value)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
