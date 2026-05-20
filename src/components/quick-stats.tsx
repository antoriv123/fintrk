"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { useLocaleCode, useT } from "@/lib/i18n";
import type { QuickStats } from "@/lib/api-types";

interface Props {
  from: string;
  to: string;
}

export function QuickStatsRow({ from, to }: Props) {
  const localeCode = useLocaleCode();
  const t = useT();
  const { data, loading } = useFetch<QuickStats>(`/api/quick-stats?from=${from}&to=${to}`);

  if (loading) {
    return (
      <div className="mb-4">
        <Skeleton className="h-3 w-32 mb-2" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-2 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const savingsColor =
    data.savingsRate >= 30 ? "text-[#2D6A4F]" :
    data.savingsRate >= 0 ? "text-foreground" :
    "text-expense";

  return (
    <div className="mb-4">
      <p className="text-muted-foreground text-[10px] tracking-wide mb-2">ESTADISTICAS RAPIDAS</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-[10px] tracking-wide">GASTO DIARIO PROM.</p>
            <p className="text-xl font-bold">
              €{data.dailyAverage.toLocaleString(localeCode, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-[10px] tracking-wide">DIAS SIN GASTAR</p>
            <p className={`text-xl font-bold ${data.zeroSpendDays > 0 ? "text-[#2D6A4F]" : "text-foreground"}`}>
              {data.zeroSpendDays}
            </p>
            <p className="text-muted-foreground text-[10px]">este periodo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-[10px] tracking-wide">MAYOR GASTO</p>
            <p className="text-xl font-bold text-expense">
              €{Math.round(data.maxExpense).toLocaleString(localeCode)}
            </p>
            {data.maxExpenseDescription && (
              <p className="text-muted-foreground text-[10px] truncate">{data.maxExpenseDescription}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-[10px] tracking-wide">{t("savingsRateUppercase")}</p>
            <p className={`text-xl font-bold ${savingsColor}`}>{data.savingsRate}%</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
