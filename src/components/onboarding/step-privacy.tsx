"use client";

import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, EyeOff, HandCoins, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

export function StepPrivacy({ onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  // Consent is persisted by the downstream flow:
  //  - email/password: /api/auth/register writes users.privacy_accepted_at +
  //    privacy_version when called with privacyAccepted=true (step-password).
  //  - Apple Sign In: onboarding page.tsx calls /api/user/accept-privacy in
  //    nextStep() when leaving this step.
  // Calling the endpoint here unconditionally broke the email/password flow
  // because the user is not authenticated yet at this step (register happens
  // in the next step) — POST returned 401 and blocked advance.
  function handleAccept() {
    onUpdate({ privacyAccepted: true });
    onNext();
  }

  const POINTS = [
    { Icon: Lock, title: t("privacyPoint1Title"), desc: t("privacyPoint1Desc") },
    { Icon: EyeOff, title: t("privacyPoint2Title"), desc: t("privacyPoint2Desc") },
    { Icon: HandCoins, title: t("privacyPoint3Title"), desc: t("privacyPoint3Desc") },
  ];

  return (
    <div className="animate-in slide-in-from-right-8 duration-400 flex flex-col gap-6">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-2">
          <ChevronLeft size={16} /> {t("back")}
        </button>
      )}

      <div className="flex flex-col items-center gap-4 text-center pt-4">
        <div className="w-20 h-20 rounded-3xl bg-[#2D6A4F]/10 flex items-center justify-center">
          <ShieldCheck className="text-[#2D6A4F]" size={40} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-tight">{t("privacyTitle")}</h1>
          <p className="text-muted-foreground text-sm max-w-[320px]">
            {t("privacySubtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {POINTS.map((p, i) => (
          <div
            key={p.title}
            className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
          >
            <span className="w-9 h-9 rounded-xl bg-[#2D6A4F]/10 flex items-center justify-center shrink-0 mt-0.5">
              <p.Icon className="text-[#2D6A4F]" size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{p.title}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground text-center px-6 leading-relaxed">
        {t("privacyFooter")}
      </p>

      <Button className="w-full" size="lg" onClick={handleAccept}>
        {t("privacyCta")}
      </Button>
    </div>
  );
}
