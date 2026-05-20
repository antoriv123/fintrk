"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepEmail({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [email, setEmail] = useState(state.userEmail);

  const isValid = EMAIL_RE.test(email.trim());

  function handleNext() {
    if (!isValid) return;
    const normalized = email.trim().toLowerCase();
    // Pre-fill name from email local-part if user hasn't typed one yet.
    const update: { userEmail: string; userName?: string } = { userEmail: normalized };
    if (!state.userName) {
      const local = normalized.split("@")[0];
      const guess = local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      if (guess && !/^\d+$/.test(guess)) update.userName = guess;
    }
    onUpdate(update);
    onNext();
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}
      <div className="mt-8 text-center">
        <h2 className="text-2xl font-bold">{t("whatsYourEmail")}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("toAccessAccount")}
        </p>
      </div>

      <div className="mt-8">
        <Input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
          autoFocus
          autoComplete="email"
          className="text-center text-lg h-14 font-medium"
        />
      </div>

      <Button
        onClick={handleNext}
        disabled={!isValid}
        className="w-full mt-6"
        size="lg"
      >
        {t("nextArrow")}
      </Button>
    </div>
  );
}
