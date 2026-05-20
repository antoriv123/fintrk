"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FintrkLogo } from "@/components/fintrk-logo";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

export default function WelcomePage() {
  const router = useRouter();
  const t = useT();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function redirectForSession() {
      try {
        const res = await apiFetch("/api/auth/session");
        const data = await res.json();
        if (data.user) {
          router.replace("/dashboard");
        } else {
          setChecking(false);
        }
      } catch {
        setChecking(false);
      }
    }

    redirectForSession();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <FintrkLogo size="xl" />
      </div>
    );
  }

  return (
    <div className="animate-in min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Logo + tagline */}
      <div className="flex flex-col items-center text-center mt-12 mb-auto pt-24">
        <FintrkLogo size="xl" className="mb-3" />
        <p className="text-muted-foreground text-base max-w-[260px]">
          {t("welcomeTagline")}
        </p>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-sm flex flex-col gap-3 mb-12">
        <Link
          href="/onboarding"
          className="w-full text-center rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-white active:scale-[0.97] transition-transform"
        >
          {t("createAccount")}
        </Link>
        <Link
          href="/gate/e"
          className="w-full text-center rounded-2xl border border-border bg-card px-5 py-4 text-base font-semibold text-foreground active:scale-[0.97] transition-transform"
        >
          {t("login")}
        </Link>
      </div>
    </div>
  );
}
