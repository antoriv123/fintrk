"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { Confetti } from "@/components/onboarding/confetti";
import { StepWelcome } from "@/components/onboarding/step-welcome";
import { StepLanguage } from "@/components/onboarding/step-language";
import { StepNameEmail } from "@/components/onboarding/step-name-email";
import { StepPrivacy } from "@/components/onboarding/step-privacy";
import { StepPassword } from "@/components/onboarding/step-password";
import { StepCountry } from "@/components/onboarding/step-country";
import { StepBanks } from "@/components/onboarding/step-banks";
import { StepGoals } from "@/components/onboarding/step-goals";
import { StepDone } from "@/components/onboarding/step-done";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEPS_APPLE,
  type OnboardingStep,
  type OnboardingState,
} from "@/components/onboarding/types";

export default function OnboardingPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [showConfetti, setShowConfetti] = useState(false);
  const [saving, setSaving] = useState(false);
  // viaApple=true means user signed in with Apple — skip identity+password
  // (App Store Guideline 4: Sign in with Apple already provides name+email).
  const [viaApple, setViaApple] = useState(false);

  const [state, setState] = useState<OnboardingState>({
    step: "welcome",
    language: "es",
    userName: "",
    userEmail: "",
    userPassword: "",
    privacyAccepted: false,
    country: null,
    selectedBanks: [],
    goals: [],
    subscriptions: [],
    recurringExpenses: [],
    accountSetups: [],
  });

  // Detect Apple-authed session on mount and pre-fill identity fields so the
  // flow never asks the user again for what Apple already provided.
  // Also guard against onboarded users landing here by mistake — kick them
  // to the dashboard instead of forcing them through the wizard again.
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/auth/session");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.user?.onboarded) {
          router.replace("/dashboard");
          return;
        }
        if (data?.user?.viaApple) {
          setViaApple(true);
          setState((prev) => ({
            ...prev,
            userName: data.user.name ?? prev.userName,
            userEmail: data.user.email ?? prev.userEmail,
          }));
        }
      } catch {
        // session check is best-effort; fall back to default email/password flow
      }
    })();
  }, [router]);

  const steps = viaApple ? ONBOARDING_STEPS_APPLE : ONBOARDING_STEPS;

  const onUpdate = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  function goToStep(step: OnboardingStep) {
    setState((prev) => ({ ...prev, step }));
    if (step === "done") {
      setTimeout(() => setShowConfetti(true), 300);
    }
  }

  function nextStep() {
    const idx = steps.indexOf(state.step);
    // Apple flow: user account is already created by /api/auth/apple/callback,
    // so the register step that normally records consent is skipped. Record
    // GDPR consent explicitly when leaving the privacy step.
    if (viaApple && state.step === "privacy") {
      apiFetch("/api/user/accept-privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => {
        // best-effort; don't block the user if the call fails
      });
    }
    if (idx < steps.length - 1) {
      goToStep(steps[idx + 1]);
    }
  }

  function prevStep() {
    const idx = steps.indexOf(state.step);
    if (idx > 0) {
      goToStep(steps[idx - 1]);
    }
  }

  // Steps where back is not allowed:
  // - "welcome" / "language": first steps, nothing to go back to
  // - "password": account is created here, can't un-register; privacy was already accepted before
  const NO_BACK_STEPS: OnboardingStep[] = ["welcome", "language", "password"];
  const onBack = NO_BACK_STEPS.includes(state.step) ? undefined : prevStep;

  async function finishOnboarding() {
    setSaving(true);
    try {
      // Onboarding ya no pide gastos fijos ni configuracion detallada de
      // cuentas (eso vive en /setup/* y se ofrece desde el panel del
      // dashboard). De los bancos seleccionados creamos shells sin
      // initial_balance — el user los completa luego.
      const payload = {
        country: state.country?.code ?? "ES",
        currency: state.country?.currency ?? "EUR",
        accounts: state.selectedBanks.map((bank) => ({
          slug: bank.slug,
          name: bank.name,
          color: bank.color,
          initialBalance: 0,
        })),
        goals: state.goals,
        subscriptions: [] as Array<{ name: string; slug: string; amount: number; category: string }>,
        recurringExpenses: [] as Array<{ name: string; slug: string; amount: number; category: string }>,
      };

      const res = await apiFetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        const { toast } = await import("sonner");
        toast.error(data.error || t("errorSavingOnboarding"));
        setSaving(false);
        return;
      }

      localStorage.setItem("fintrk-show-tour", "1");
      router.push("/dashboard?welcome=1");
      router.refresh();
    } catch {
      const { toast } = await import("sonner");
      toast.error(t("connectionErrorRetry"));
      setSaving(false);
    }
  }

  const stepProps = { state, onNext: nextStep, onBack, onUpdate, goTo: goToStep };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 px-4 pb-[env(safe-area-inset-bottom,16px)]">
        <Confetti active={showConfetti} />

        <OnboardingProgress
          currentStep={state.step}
          steps={steps}
          onDotClick={(s) => {
            const currentIdx = steps.indexOf(state.step);
            const targetIdx = steps.indexOf(s);
            if (targetIdx <= currentIdx) goToStep(s);
          }}
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          {state.step === "welcome" && <StepWelcome {...stepProps} />}
          {state.step === "language" && <StepLanguage {...stepProps} />}
          {state.step === "identity" && <StepNameEmail {...stepProps} />}
          {state.step === "privacy" && <StepPrivacy {...stepProps} />}
          {state.step === "password" && <StepPassword {...stepProps} />}
          {state.step === "country" && <StepCountry {...stepProps} />}
          {state.step === "banks" && <StepBanks {...stepProps} />}
          {state.step === "goals" && <StepGoals {...stepProps} />}
          {state.step === "done" && (
            <>
              <StepDone {...stepProps} />
              <Button
                onClick={finishOnboarding}
                disabled={saving}
                className="w-full mt-6"
                size="lg"
              >
                {saving ? t("savingEllipsis") : t("goToMyDashboard")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
