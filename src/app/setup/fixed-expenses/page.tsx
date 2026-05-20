"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { StepExpenses } from "@/components/onboarding/step-expenses";
import type {
  ActiveRecurring,
  ActiveSubscription,
  OnboardingState,
} from "@/components/onboarding/types";

// Wrapper standalone del paso "expenses" del onboarding viejo. Reusa el
// componente StepExpenses (suscripciones + gastos recurrentes) y vive en
// /setup/fixed-expenses, accesible desde el panel "Completar primeros pasos".
export default function SetupFixedExpensesPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const [saving, setSaving] = useState(false);
  const [subscriptions, setSubscriptions] = useState<ActiveSubscription[]>([]);
  const [recurring, setRecurring] = useState<ActiveRecurring[]>([]);

  const fakeState: OnboardingState = useMemo(
    () => ({
      step: "expenses",
      language: "es",
      userName: "",
      userEmail: "",
      userPassword: "",
      privacyAccepted: true,
      country: null,
      selectedBanks: [],
      goals: [],
      subscriptions,
      recurringExpenses: recurring,
      accountSetups: [],
    }),
    [subscriptions, recurring],
  );

  function onUpdate(partial: Partial<OnboardingState>) {
    if (partial.subscriptions) setSubscriptions(partial.subscriptions);
    if (partial.recurringExpenses) setRecurring(partial.recurringExpenses);
  }

  async function finish() {
    if (subscriptions.length === 0 && recurring.length === 0) {
      // Nada que guardar — el user solo cierra y vuelve.
      router.push("/dashboard");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        subscriptions: subscriptions.map((s) => ({
          name: s.name,
          slug: s.slug,
          amount: s.amount,
          category: "suscripciones",
        })),
        recurringExpenses: recurring.map((r) => ({
          name: r.name,
          slug: r.slug,
          amount: r.amount,
          category: r.category,
        })),
      };
      const res = await apiFetch("/api/setup/fixed-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const { toast } = await import("sonner");
        toast.error(data.error || "Error al guardar");
        setSaving(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      const { toast } = await import("sonner");
      toast.error("Error de conexion");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 px-4 pb-[env(safe-area-inset-bottom,16px)]">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4 pb-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 -ml-1 rounded-full hover:bg-muted/60 active:scale-95 transition-all flex items-center justify-center"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight">
              {t("setupFixedPageTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("setupFixedPageSub")}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          <StepExpenses
            state={fakeState}
            onNext={finish}
            onUpdate={onUpdate}
          />
        </div>

        <Button
          onClick={finish}
          disabled={saving}
          className="w-full mt-2"
          size="lg"
        >
          {saving ? t("setupSaving") : t("setupDone")}
        </Button>
      </div>
    </div>
  );
}
