"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

export function StepName({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [name, setName] = useState(state.userName);

  function handleNext() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    onUpdate({ userName: trimmed });
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
        <h2 className="text-2xl font-bold">{t("whatsYourName")}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("personalizeExperience")}
        </p>
      </div>

      <div className="mt-8">
        <Input
          type="text"
          placeholder={t("yourName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNext()}
          autoFocus
          autoComplete="name"
          maxLength={50}
          className="text-center text-lg h-14 font-medium"
        />
      </div>

      <Button
        onClick={handleNext}
        disabled={name.trim().length < 2}
        className="w-full mt-6"
        size="lg"
      >
        {t("nextArrow")}
      </Button>
    </div>
  );
}
