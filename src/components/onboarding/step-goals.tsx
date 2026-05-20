"use client";

import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { getGoalIcon } from "@/lib/onboarding-icons";
import type { OnboardingStepProps } from "./types";

export function StepGoals({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const GOALS = [
    {
      id: "control_spending",
      title: t("goalControlSpending"),
      desc: t("goalControlSpendingDesc"),
    },
    {
      id: "save",
      title: t("goalSaveMore"),
      desc: t("goalSaveMoreDesc"),
    },
    {
      id: "invest",
      title: t("goalInvestBetter"),
      desc: t("goalInvestBetterDesc"),
    },
    {
      id: "debt",
      title: t("goalEliminateDebt"),
      desc: t("goalEliminateDebtDesc"),
    },
    {
      id: "budget",
      title: t("goalBudget"),
      desc: t("goalBudgetDesc"),
    },
  ];

  function toggleGoal(id: string) {
    const current = state.goals;
    const next = current.includes(id)
      ? current.filter((g) => g !== id)
      : [...current, id];
    onUpdate({ goals: next });
  }

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold">{t("whatAreYourGoals")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("selectAllThatApply")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {GOALS.map((goal, i) => {
          const isSelected = state.goals.includes(goal.id);
          const Icon = getGoalIcon(goal.id);
          return (
            <button
              key={goal.id}
              onClick={() => toggleGoal(goal.id)}
              className={`w-full flex items-center gap-3.5 p-4 rounded-xl border-2 text-left transition-colors animate-in fade-in slide-in-from-bottom-2 ${
                isSelected
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:border-muted-foreground/30"
              }`}
              style={{
                animationDelay: `${i * 60}ms`,
                animationFillMode: "both",
              }}
            >
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                isSelected ? "bg-primary/10" : "bg-secondary"
              }`}>
                <Icon className={isSelected ? "text-primary" : "text-muted-foreground"} size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{goal.title}</p>
                <p className="text-xs text-muted-foreground">{goal.desc}</p>
              </div>
              {isSelected && (
                <Check
                  className="text-primary animate-in zoom-in shrink-0 ml-auto"
                  size={18}
                />
              )}
            </button>
          );
        })}
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={state.goals.length === 0}
        onClick={onNext}
      >
        {t("nextArrow")}
      </Button>

      <button
        type="button"
        onClick={onNext}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center mx-auto"
      >
        {t("continueWithoutGoals")}
      </button>
    </div>
  );
}
