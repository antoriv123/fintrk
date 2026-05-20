"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { StepAccounts } from "@/components/onboarding/step-accounts";
import type {
  AccountSetup,
  OnboardingState,
} from "@/components/onboarding/types";
import { COUNTRIES, type BankInfo, type CountryInfo } from "@/data/banks-by-country";

interface AccountRow {
  id: number;
  slug: string;
  name: string;
  color: string;
  initial_balance: number;
  currency: string;
}

// Wrapper standalone del paso "accounts" del onboarding viejo. Reusa el
// componente StepAccounts (importar extracto / poner balance) y vive en
// /setup/account, accesible desde el panel "Completar primeros pasos".
export default function SetupAccountPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [country, setCountry] = useState<CountryInfo | null>(null);
  const [accountSetups, setAccountSetups] = useState<AccountSetup[]>([]);

  const selectedBanks = useMemo<BankInfo[]>(
    () => accounts.map((a) => ({ slug: a.slug, name: a.name, color: a.color })),
    [accounts],
  );

  useEffect(() => {
    (async () => {
      try {
        const [accRes, settingsRes] = await Promise.all([
          apiFetch("/api/accounts?transactions=0"),
          apiFetch("/api/settings"),
        ]);
        if (accRes.ok) {
          const data = await accRes.json();
          setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
        }
        if (settingsRes.ok) {
          const sdata = await settingsRes.json();
          if (sdata?.country) {
            const found = COUNTRIES.find((c) => c.code === sdata.country);
            if (found) setCountry(found);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Si el user llega aqui sin haber escogido un banco en el onboarding
  // (caso edge), redirigirlo a /accounts donde puede crearlos.
  useEffect(() => {
    if (!loading && accounts.length === 0) {
      router.replace("/accounts?from=setup");
    }
  }, [loading, accounts.length, router]);

  // Sintetizamos el shape de OnboardingState que StepAccounts espera. Solo
  // los campos que el componente realmente toca importan.
  const fakeState: OnboardingState = useMemo(
    () => ({
      step: "accounts",
      language: "es",
      userName: "",
      userEmail: "",
      userPassword: "",
      privacyAccepted: true,
      country,
      selectedBanks,
      goals: [],
      subscriptions: [],
      recurringExpenses: [],
      accountSetups,
    }),
    [country, selectedBanks, accountSetups],
  );

  function onUpdate(partial: Partial<OnboardingState>) {
    if (partial.accountSetups) setAccountSetups(partial.accountSetups);
  }

  async function finish() {
    setSaving(true);
    try {
      const payload = {
        currency: country?.currency,
        accounts: selectedBanks.map((bank) => {
          const setup = accountSetups.find((a) => a.slug === bank.slug);
          return {
            slug: bank.slug,
            name: bank.name,
            color: bank.color,
            initialBalance: setup?.mode === "balance" ? setup.balance : 0,
          };
        }),
      };
      const res = await apiFetch("/api/setup/account", {
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

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
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
              {t("setupAccountPageTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("setupAccountPageSub")}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          <StepAccounts
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
