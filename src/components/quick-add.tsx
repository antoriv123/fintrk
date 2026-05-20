"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, X, Check, Loader2, ChevronRight } from "lucide-react";
import { apiFetchOrQueue } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Confetti } from "@/components/onboarding/confetti";
import { useFetch } from "@/hooks/use-fetch";
import { haptic } from "@/lib/premium/haptics";

interface AccountOption { slug: string; name: string; color: string; }

const RECENT_CATEGORY_KEY = "fintrk-last-category";
const QUICK_CATS = ["supermercado", "transporte", "ocio", "suscripciones", "salud", "ropa"] as const;

export function QuickAdd({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const { data: accountsData } = useFetch<{ accounts: AccountOption[] }>("/api/accounts");
  const accounts = accountsData?.accounts ?? [];
  const defaultAccount = accounts[0]?.slug;

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDescription("");
    const stored = typeof window !== "undefined" ? localStorage.getItem(RECENT_CATEGORY_KEY) : null;
    setCategory(stored && (EXPENSE_CATEGORIES as Record<string, unknown>)[stored] ? stored : "supermercado");
    setTimeout(() => amountRef.current?.focus(), 100);
  }, [open]);

  async function handleSave() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    if (!defaultAccount && accounts.length > 0) return;
    setSaving(true);
    try {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await apiFetchOrQueue("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: n,
          currency: "EUR",
          eur_amount: n,
          direction: "expense",
          description: description || t("quickAddDescription"),
          category: category || "otros",
          expense_type: "necesario",
          date,
          account: defaultAccount ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const { toast } = await import("sonner");
        toast.error(data.error || "Error");
        setSaving(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (typeof window !== "undefined") {
        localStorage.setItem(RECENT_CATEGORY_KEY, category);
      }
      setCelebrate(true);
      haptic.confirm();
      const { toast } = await import("sonner");
      toast.success(`${t("quickAddSaved")} −€${n.toFixed(2)}`);
      if (data?.streak?.isFirst) {
        toast(t("streakUnlocked"), { icon: "🔥" });
      }
      setTimeout(() => {
        setOpen(false);
        setCelebrate(false);
        setSaving(false);
        onSaved?.();
      }, 900);
    } catch {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { haptic.tap(); setOpen(true); }}
        aria-label={t("quickAddTitle")}
        className="fixed right-4 z-50 w-14 h-14 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-xl shadow-[#2D6A4F]/30 active:scale-90 transition-transform"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
      >
        <Plus size={26} className="text-white" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center animate-in"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={() => !saving && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border border-border shadow-2xl p-5 animate-[slideInUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <Confetti active={celebrate} />

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold">{t("quickAddTitle")}</p>
              <button
                onClick={() => !saving && setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90"
                disabled={saving}
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Amount */}
            <div className="flex items-center justify-center gap-1 py-4">
              <span className="text-4xl font-light text-muted-foreground/40">€</span>
              <input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("quickAddPlaceholder")}
                className="text-5xl font-extrabold text-center w-44 bg-transparent border-none outline-none tabular-nums placeholder:text-muted-foreground/15"
              />
            </div>

            {/* Description (optional) */}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("quickAddDescription")}
              className="w-full text-center bg-muted/40 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 mb-4"
            />

            {/* Quick category pills */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {QUICK_CATS.map((slug) => {
                const info = EXPENSE_CATEGORIES[slug];
                const active = category === slug;
                return (
                  <button
                    key={slug}
                    onClick={() => setCategory(slug)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${
                      active
                        ? "bg-[#2D6A4F]/10 border-[#2D6A4F]/40"
                        : "bg-card border-border"
                    }`}
                  >
                    <CategoryIcon icon={info.icon} color={active ? "#2D6A4F" : info.color} size="sm" withBackground={false} />
                    <span className={`text-[10px] font-semibold ${active ? "text-[#2D6A4F]" : "text-muted-foreground"}`}>
                      {info.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !parseFloat(amount)}
              className="w-full h-12 rounded-2xl bg-[#2D6A4F] text-white font-bold text-sm shadow-lg shadow-[#2D6A4F]/25 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> {t("quickAddSave")}</>
              ) : (
                <><Check size={16} /> {t("quickAddSave")}</>
              )}
            </button>

            <Link
              href="/transactions/new"
              className="flex items-center justify-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("quickAddMore")} <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
