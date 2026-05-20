"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepNameEmail({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [name, setName] = useState(state.userName);
  const [email, setEmail] = useState(state.userEmail);

  const nameValid = name.trim().length >= 2;
  const emailValid = EMAIL_RE.test(email.trim());
  const isValid = nameValid && emailValid;

  function handleEmailBlur() {
    if (!emailValid || name.trim()) return;
    const normalized = email.trim().toLowerCase();
    const local = normalized.split("@")[0];
    const guess = local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    if (guess && !/^\d+$/.test(guess)) setName(guess);
  }

  function handleNext() {
    if (!isValid) return;
    const normalized = email.trim().toLowerCase();
    onUpdate({ userName: name.trim(), userEmail: normalized });
    onNext();
  }

  return (
    <div className="animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2"
        >
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}

      <div className="mt-8 text-center">
        <h2 className="text-2xl font-bold">{t("identityTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-2">{t("identitySubtitle")}</p>
      </div>

      <div className="mt-8 space-y-3">
        <Input
          type="text"
          placeholder={t("yourName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="name"
          maxLength={50}
          className="text-center text-lg h-14 font-medium"
        />
        <Input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
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
