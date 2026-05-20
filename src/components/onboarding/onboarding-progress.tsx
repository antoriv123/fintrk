"use client";

import { ONBOARDING_STEPS, STEP_SCORES, type OnboardingStep } from "./types";

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  steps?: OnboardingStep[];
  onDotClick?: (step: OnboardingStep) => void;
}

export function OnboardingProgress({ currentStep, steps, onDotClick }: OnboardingProgressProps) {
  const stepList = steps ?? ONBOARDING_STEPS;
  // If the flow skipped some steps (e.g. Apple Sign In), recompute score as
  // position within the active step list so the progress bar still matches.
  const activeIdx = stepList.indexOf(currentStep);
  const score =
    activeIdx >= 0 && stepList.length > 1
      ? Math.round((activeIdx / (stepList.length - 1)) * 100)
      : STEP_SCORES[currentStep];
  const stepIndex = activeIdx;

  return (
    <div className="sticky top-0 z-10 bg-background pt-[max(1rem,env(safe-area-inset-top))] pb-2">
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-600 ease-out"
          style={{
            width: `${score}%`,
            background: "linear-gradient(90deg, var(--color-primary), #4ADE80)",
          }}
        />
      </div>

      {/* Meta row */}
      <div className="flex justify-end items-center mt-2">
        <span
          key={score}
          className="text-xs font-bold text-primary animate-in zoom-in-95 duration-300"
        >
          Personalización: {score}%
        </span>
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-1.5 mt-2.5">
        {stepList.map((s, i) => (
          <button
            key={s}
            onClick={() => i <= stepIndex && onDotClick?.(s)}
            disabled={i > stepIndex}
            className={`h-2 rounded-full transition-all duration-300 ${
              s === currentStep
                ? "w-6 bg-primary"
                : i < stepIndex
                  ? "w-2 bg-primary"
                  : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
