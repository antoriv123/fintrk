"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetch } from "@/hooks/use-fetch";
import { AlertTriangle } from "lucide-react";

interface EnvelopeItem {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentage: number;
}

interface BudgetsResponse {
  envelopes: EnvelopeItem[];
}

function getBarColor(percentage: number): string {
  if (percentage >= 90) return "text-expense";
  if (percentage >= 75) return "text-yellow-500";
  return "text-income";
}

export function BudgetProgress() {
  const { data, loading } = useFetch<BudgetsResponse>("/api/budgets");

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <Skeleton className="h-3 w-36 mb-3" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-[10px] tracking-wide">PRESUPUESTO MENSUAL</p>
          <p className="text-xs text-muted-foreground">Este mes</p>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {/* Budget alerts */}
        {(data.envelopes ?? []).some((b) => b.percentage >= 90) && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
            <AlertTriangle size={14} className="text-expense flex-shrink-0" />
            <span className="text-xs text-expense">
              {(data.envelopes ?? []).filter((b) => b.percentage >= 100).length > 0
                ? `Has superado el presupuesto en ${(data.envelopes ?? []).filter((b) => b.percentage >= 100).map((b) => b.category).join(", ")}`
                : `Estas cerca del limite en ${(data.envelopes ?? []).filter((b) => b.percentage >= 90 && b.percentage < 100).map((b) => b.category).join(", ")}`
              }
            </span>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {(data.envelopes ?? []).map((b) => {
            const cappedPct = Math.min(b.percentage, 100);
            const colorClass = getBarColor(b.percentage);
            const isOver = b.percentage >= 100;
            return (
              <div key={b.category}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                    {isOver && <AlertTriangle size={10} className="text-expense" />}
                    {b.category}
                  </span>
                  <span className={`text-xs font-medium ${colorClass}`}>
                    €{b.spent.toFixed(0)} / €{b.budgeted}
                    {isOver && (
                      <span className="text-expense ml-1">(+€{(b.spent - b.budgeted).toFixed(0)})</span>
                    )}
                  </span>
                </div>
                <Progress value={cappedPct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
