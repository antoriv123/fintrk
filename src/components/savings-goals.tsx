"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useFetch } from "@/hooks/use-fetch";
import { useT, useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";

interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  is_completed: number;
  created_at: string;
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

interface SavingsGoalsProps {
  compact?: boolean;
}

export function SavingsGoals({ compact = false }: SavingsGoalsProps) {
  const t = useT();
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol("EUR");
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);
  const { data } = useFetch<{ goals: SavingsGoal[] }>("/api/goals");

  const goals = data?.goals ?? [];

  if (goals.length === 0) {
    return null;
  }

  return (
    <Card className="mt-3">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[10px] tracking-wide mb-3">
          {t("savingsGoalsUppercase")}
        </p>

        <div className={`flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
          {goals.map((goal) => {
            const pct = goal.target_amount > 0
              ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
              : 0;

            return (
              <div key={goal.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{goal.name}</span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>

                <Progress value={pct} className="h-2 mb-1" />

                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {sym}{fmtInt(goal.current_amount)} / {sym}{fmtInt(goal.target_amount)}
                  </span>
                  {!compact && goal.deadline && (
                    <span className="text-xs text-muted-foreground">
                      Deadline: {formatDeadline(goal.deadline)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
