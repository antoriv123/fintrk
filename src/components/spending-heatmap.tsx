"use client";

import { useFetch } from "@/hooks/use-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleCode } from "@/lib/i18n";

interface DailySpending {
  date: string;
  total: number;
  count: number;
}

function getInlineColor(total: number, max: number): string {
  if (total === 0) return "transparent";
  const ratio = total / max;
  if (ratio < 0.25) return "#14532d";
  if (ratio < 0.6) return "#16a34a";
  return "#ef4444";
}

function formatDate(dateStr: string, localeCode: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(localeCode, { day: "numeric", month: "short" });
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

export function SpendingHeatmap() {
  const localeCode = useLocaleCode();
  const { data, loading } = useFetch<DailySpending[]>("/api/daily-spending");

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <Skeleton className="h-3 w-48 mb-3" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-sm" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.total), 1);

  // Build a 7-column grid starting from Monday
  const firstDate = new Date(data[0].date + "T12:00:00");
  // getDay() returns 0=Sun, so convert to Mon=0 ... Sun=6
  const firstDow = (firstDate.getDay() + 6) % 7;

  // Pad with empty cells to align the grid
  const cells: ({ date: string; total: number; count: number } | null)[] = [
    ...Array(firstDow).fill(null),
    ...data,
  ];

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-muted-foreground text-[10px] tracking-wide">
            ACTIVIDAD — ÚLTIMOS 30 DÍAS
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>menos</span>
            {["transparent", "#14532d", "#16a34a", "#ef4444"].map((c, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-sm border border-border"
                style={{ background: c }}
              />
            ))}
            <span>más</span>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[9px] text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={i} className="aspect-square rounded-sm" />;
            }
            const color = getInlineColor(cell.total, max);
            const label = `${formatDate(cell.date, localeCode)}: €${cell.total.toFixed(2)}`;
            return (
              <div
                key={i}
                className="aspect-square rounded-sm cursor-default border border-transparent"
                style={{ background: color || undefined, backgroundColor: color === "transparent" ? undefined : color }}
                title={label}
              />
            );
          })}
        </div>

        {/* Simple stats below */}
        <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
          <span>{data.filter((d) => d.total > 0).length} días con gastos</span>
          <span>
            Pico: €{Math.max(...data.map((d) => d.total)).toFixed(2)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
