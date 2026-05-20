"use client";
import { apiFetch, setAuthToken, isNativePlatform } from "@/lib/api";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, AlertCircle, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps } from "./types";

export function StepPassword({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [password, setPassword] = useState(state.userPassword);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = password.length >= 8 && password === confirmPassword;

  async function handleNext() {
    setError("");

    if (password.length < 8) {
      setError(t("min8Chars"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.userName,
          email: state.userEmail,
          password,
          privacyAccepted: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("errorCreatingAccount"));
        setLoading(false);
        return;
      }

      if (isNativePlatform() && data.token) {
        setAuthToken(data.token);
      }

      onUpdate({ userPassword: password });
      onNext();
    } catch {
      setError(t("connectionError"));
      setLoading(false);
    }
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
        <h2 className="text-2xl font-bold">{t("choosePassword")}</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {t("min8Chars")}
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm animate-in fade-in duration-200">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="new-password"
              minLength={8}
              className="text-center text-lg h-14 font-medium pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && isValid && handleNext()}
            autoComplete="new-password"
            minLength={8}
            className="text-center text-lg h-14 font-medium"
          />
        </div>
      </div>

      <Button
        onClick={handleNext}
        disabled={!isValid || loading}
        className="w-full mt-6"
        size="lg"
      >
        {loading ? t("creatingAccount") : t("createAccountArrow")}
      </Button>

      <p className="text-center text-sm text-muted-foreground mt-4">
        {t("alreadyHaveAccount")}{" "}
        <Link href="/gate/e" className="text-primary hover:underline font-medium">
          {t("login")}
        </Link>
      </p>
    </div>
  );
}
