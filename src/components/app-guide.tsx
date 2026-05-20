"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { X, ChevronRight, Wallet, Camera, Sparkles, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface TourStep {
  route: string;
  icon: typeof Camera;
  iconBg: string;
  titleKey: string;
  descKey: string;
  tipKey: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    route: "/accounts",
    icon: Wallet,
    iconBg: "bg-blue-500",
    titleKey: "tourAccountsTitle",
    descKey: "tourAccountsDesc",
    tipKey: "tourAccountsTip",
  },
  {
    route: "/transactions/new",
    icon: Camera,
    iconBg: "bg-[#2D6A4F]",
    titleKey: "tourAddTitle",
    descKey: "tourAddDesc",
    tipKey: "tourAddTip",
  },
  {
    route: "/insights",
    icon: Sparkles,
    iconBg: "bg-[#0EA5E9]",
    titleKey: "tourInsightsTitle",
    descKey: "tourInsightsDesc",
    tipKey: "tourInsightsTip",
  },
  {
    route: "/achievements",
    icon: Flame,
    iconBg: "bg-[#FF6B35]",
    titleKey: "tourStreakTitle",
    descKey: "tourStreakDesc",
    tipKey: "tourStreakTip",
  },
];

export function AppGuide({ onDismiss }: { onDismiss: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [navigated, setNavigated] = useState(false);

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Navigate to the step's route when step changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets navigated flag synchronously on step change to hide content until route transition completes
    setNavigated(false);
    router.push(step.route);
    const timer = setTimeout(() => setNavigated(true), 600);
    return () => clearTimeout(timer);
  }, [currentStep, step.route, router]);

  function handleNext() {
    if (isLast) {
      router.push("/dashboard");
      onDismiss();
    } else {
      setCurrentStep(currentStep + 1);
    }
  }

  function handleSkip() {
    router.push("/dashboard");
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-[95] pointer-events-none">
      {/* Bottom card overlay */}
      <div
        className={`pointer-events-auto fixed bottom-0 left-0 right-0 z-[96] transition-all duration-500 ${
          navigated ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
      >
        <div className="mx-3 mb-[env(safe-area-inset-bottom,16px)] rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-border">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl ${step.iconBg} flex items-center justify-center shadow-lg`}>
                  <Icon size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium tracking-wide">
                    {t("tourStep")} {currentStep + 1}/{TOUR_STEPS.length}
                  </p>
                  <h3 className="text-base font-bold">{t(step.titleKey)}</h3>
                </div>
              </div>
              <button
                onClick={handleSkip}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              {t(step.descKey)}
            </p>

            {/* Tip */}
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 mb-4">
              <p className="text-xs text-primary font-medium">{t(step.tipKey)}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-1"
              >
                {t("skipTour")}
              </button>
              <Button
                className="flex-1 rounded-2xl bg-primary hover:bg-primary/90 font-semibold h-12"
                onClick={handleNext}
              >
                {isLast ? t("finishTour") : t("nextStep")}
                {!isLast && <ChevronRight size={18} className="ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
