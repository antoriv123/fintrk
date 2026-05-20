"use client";

/**
 * Dashboard CTA card for Apple Pay setup.
 * Auto-hides when user completes all 3 steps, or when dismissed for 7 days.
 * Lightweight — fetches /api/account/apple-pay-status once on mount.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Smartphone, ArrowRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { isNative } from "@/lib/platform";

interface Status {
  has_active_token: boolean;
  step1_installed: boolean;
  step2_automated: boolean;
  step3_verified: boolean;
  all_done: boolean;
}

const DISMISS_KEY = "apple_pay_cta_dismissed_until";

function computeInitialDismissed(): boolean {
  if (typeof window === "undefined") return true; // SSR: start hidden
  const ua = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua) || isNative();
  if (!isIos) return true;
  try {
    const dismissUntilRaw = localStorage.getItem(DISMISS_KEY);
    if (dismissUntilRaw) {
      const until = parseInt(dismissUntilRaw, 10);
      if (Number.isFinite(until) && until > Date.now()) return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function ApplePayCTA() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(computeInitialDismissed);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    apiFetch("/api/account/apple-pay-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => { if (!cancelled) setStatus(s); })
      .catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [dismissed]);

  if (dismissed || !status || status.all_done) return null;

  // Figure out current step
  const step1 = status.has_active_token && status.step1_installed;
  const step2 = status.step2_automated;
  const step3 = status.step3_verified;
  const currentStep = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : null;
  if (currentStep === null) return null;

  const stepLabel =
    currentStep === 1 ? "Instala el shortcut"
    : currentStep === 2 ? "Crea la automatizacion"
    : "Prueba con una compra";

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
      >
        <Link
          href="/settings/apple-pay"
          className="group block relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-3 pr-10"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Smartphone size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">
                Conecta Apple Pay
              </div>
              <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                Paso {currentStep} de 3 — {stepLabel}
              </div>
            </div>
            <ArrowRight size={16} className="text-primary flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
          {/* Progress dots */}
          <div className="flex gap-1 mt-2 ml-12">
            <span className={`h-1 w-6 rounded-full ${step1 ? "bg-primary" : "bg-primary/20"}`} />
            <span className={`h-1 w-6 rounded-full ${step2 ? "bg-primary" : "bg-primary/20"}`} />
            <span className={`h-1 w-6 rounded-full ${step3 ? "bg-primary" : "bg-primary/20"}`} />
          </div>
        </Link>
        <button
          onClick={(e) => { e.preventDefault(); dismiss(); }}
          className="absolute top-2.5 right-2.5 p-1 rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Ocultar por 7 dias"
        >
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
