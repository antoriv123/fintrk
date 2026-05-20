"use client";

import { Button } from "@/components/ui/button";
import { Building2, Sparkles, Target } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Lupo } from "@/components/personality/lupo";
import type { OnboardingStepProps } from "./types";

export function StepWelcome({ onNext }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const FEATURES = [
    { Icon: Building2, label: t("welcomeFeatureBanks") },
    { Icon: Sparkles, label: t("welcomeFeatureAI") },
    { Icon: Target, label: t("welcomeFeatureInsights") },
  ];

  return (
    <div className="animate-in slide-in-from-right-8 duration-400 flex flex-col items-center gap-6 text-center">
      {/* Lupo, mascota: aparece saludando aqui y vuelve en hitos clave */}
      <Lupo state="welcome" size={120} />


      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{t("welcomeHook")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("welcomeHookSub")}
        </p>
      </div>

      <div className="w-full flex flex-col gap-2">
        {FEATURES.map((feature, i) => (
          <div
            key={feature.label}
            className="flex items-center gap-3 p-3.5 rounded-xl bg-secondary animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <feature.Icon className="text-primary" size={18} />
            </span>
            <span className="text-sm font-medium">{feature.label}</span>
          </div>
        ))}
      </div>

      <Button className="w-full" size="lg" onClick={onNext}>
        {t("getStarted")}
      </Button>
    </div>
  );
}
