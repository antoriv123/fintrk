"use client";

import { useState } from "react";
import { X, ChevronLeft, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POPULAR_SUBSCRIPTIONS } from "@/data/popular-subscriptions";
import { RECURRING_EXPENSES } from "@/data/recurring-expenses";
import { useT } from "@/lib/i18n";
import {
  getSubscriptionIcon,
  getRecurringIcon,
  getCategoryIcon,
} from "@/lib/onboarding-icons";
import type { OnboardingStepProps, ActiveSubscription, ActiveRecurring } from "./types";

// CUSTOM_CATEGORIES labels resolved at render time via t()

export function StepExpenses({ state, onNext, onBack, onUpdate }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const CUSTOM_CATEGORIES = [
    { slug: "vivienda", label: t("catVivienda") },
    { slug: "servicios", label: t("catServicios") },
    { slug: "transporte", label: t("catTransporte") },
    { slug: "seguros", label: t("catSeguros") },
    { slug: "educacion", label: t("catEducacion") },
    { slug: "salud", label: t("catSalud") },
    { slug: "otros", label: t("catOtros") },
  ];
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [subPrice, setSubPrice] = useState("");
  const [editingRecurring, setEditingRecurring] = useState<string | null>(null);
  const [recurringPrice, setRecurringPrice] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customCategory, setCustomCategory] = useState("otros");
  // Suscripción personalizada (paralelo al gasto recurrente custom).
  const [showCustomSubForm, setShowCustomSubForm] = useState(false);
  const [customSubName, setCustomSubName] = useState("");
  const [customSubAmount, setCustomSubAmount] = useState("");

  const currency = state.country?.currency ?? "EUR";
  const symbol = state.country?.symbol ?? "€";

  const total =
    state.subscriptions.reduce((sum, s) => sum + s.amount, 0) +
    state.recurringExpenses.reduce((sum, r) => sum + r.amount, 0);

  // --- Subscriptions ---
  function handleSubChipClick(slug: string) {
    const alreadyActive = state.subscriptions.find((s) => s.slug === slug);
    if (alreadyActive) {
      onUpdate({ subscriptions: state.subscriptions.filter((s) => s.slug !== slug) });
      return;
    }
    const info = POPULAR_SUBSCRIPTIONS.find((s) => s.slug === slug);
    if (!info) return;
    setEditingSub(slug);
    setSubPrice(String(info.defaultPrice[currency] ?? info.defaultPrice["EUR"] ?? ""));
  }

  function confirmSub() {
    const price = parseFloat(subPrice);
    if (isNaN(price) || price <= 0) return;
    const info = POPULAR_SUBSCRIPTIONS.find((s) => s.slug === editingSub);
    if (!info) return;
    const newSub: ActiveSubscription = {
      name: info.name,
      slug: info.slug,
      amount: price,
      icon: info.icon,
    };
    onUpdate({ subscriptions: [...state.subscriptions, newSub] });
    setEditingSub(null);
    setSubPrice("");
  }

  function cancelSub() {
    setEditingSub(null);
    setSubPrice("");
  }

  function removeSub(slug: string) {
    onUpdate({ subscriptions: state.subscriptions.filter((s) => s.slug !== slug) });
  }

  // --- Recurring ---
  function handleRecurringClick(slug: string) {
    const alreadyActive = state.recurringExpenses.find((r) => r.slug === slug);
    if (alreadyActive) {
      onUpdate({ recurringExpenses: state.recurringExpenses.filter((r) => r.slug !== slug) });
      return;
    }
    const info = RECURRING_EXPENSES.find((r) => r.slug === slug);
    if (!info) return;
    setEditingRecurring(slug);
    setRecurringPrice(
      String(info.defaultAmount[currency] ?? info.defaultAmount["EUR"] ?? "")
    );
  }

  function confirmRecurring() {
    const price = parseFloat(recurringPrice);
    if (isNaN(price) || price <= 0) return;
    const info = RECURRING_EXPENSES.find((r) => r.slug === editingRecurring);
    if (!info) return;
    const newRecurring: ActiveRecurring = {
      name: info.name,
      slug: info.slug,
      amount: price,
      icon: info.icon,
      category: info.category,
    };
    onUpdate({ recurringExpenses: [...state.recurringExpenses, newRecurring] });
    setEditingRecurring(null);
    setRecurringPrice("");
  }

  function cancelRecurring() {
    setEditingRecurring(null);
    setRecurringPrice("");
  }

  function removeRecurring(slug: string) {
    onUpdate({ recurringExpenses: state.recurringExpenses.filter((r) => r.slug !== slug) });
  }

  // Detectamos items personalizados para renderizarlos en su propia lista.
  // Sin esto, el custom se añadía al state pero nunca se pintaba un card
  // nuevo — el usuario solo veía el total subir, sin feedback del item.
  const SUGGESTED_SUB_SLUGS = new Set(POPULAR_SUBSCRIPTIONS.map((s) => s.slug));
  const SUGGESTED_RECURRING_SLUGS = new Set(RECURRING_EXPENSES.map((r) => r.slug));
  const customRecurring = state.recurringExpenses.filter((r) => !SUGGESTED_RECURRING_SLUGS.has(r.slug));

  function addCustomSubscription() {
    const price = parseFloat(customSubAmount);
    if (!customSubName.trim() || isNaN(price) || price <= 0) return;
    const slug = `custom-sub-${customSubName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-${Date.now().toString(36)}`;
    const newSub: ActiveSubscription = {
      name: customSubName.trim(),
      slug,
      amount: price,
      icon: "",
    };
    onUpdate({ subscriptions: [...state.subscriptions, newSub] });
    setCustomSubName("");
    setCustomSubAmount("");
    setShowCustomSubForm(false);
  }

  const editingSubInfo = editingSub
    ? POPULAR_SUBSCRIPTIONS.find((s) => s.slug === editingSub)
    : null;
  const editingRecurringInfo = editingRecurring
    ? RECURRING_EXPENSES.find((r) => r.slug === editingRecurring)
    : null;

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          Atrás
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold">{t("onboardingFixedExpenses")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("whatDoYouPayMonthly")}
        </p>
      </div>

      {/* Section 1: Subscriptions */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {t("onboardingSubscriptions")}
        </p>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_SUBSCRIPTIONS.map((sub) => {
            const isActive = state.subscriptions.some((s) => s.slug === sub.slug);
            const Icon = getSubscriptionIcon(sub.slug);
            return (
              <button
                key={sub.slug}
                onClick={() => handleSubChipClick(sub.slug)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-[13px] transition-colors ${
                  isActive
                    ? "border-primary bg-accent text-primary font-medium"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                {isActive ? <Check size={12} /> : <Icon size={12} className="text-muted-foreground" />}
                {sub.name}
              </button>
            );
          })}
        </div>

        {/* Inline price editor for subscriptions */}
        {editingSub && editingSubInfo && (() => {
          const Icon = getSubscriptionIcon(editingSubInfo.slug);
          return (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Icon size={14} className="text-primary" />
                {editingSubInfo.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">{symbol}</span>
                <Input
                  type="number"
                  className="h-11 text-base flex-1"
                  value={subPrice}
                  onChange={(e) => setSubPrice(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSub();
                    if (e.key === "Escape") cancelSub();
                  }}
                />
                <span className="text-sm text-muted-foreground shrink-0">{t("perMonth")}</span>
                <Button size="sm" className="h-11 px-4 shrink-0" onClick={confirmSub}>
                  OK
                </Button>
                <button
                  onClick={cancelSub}
                  className="text-muted-foreground hover:text-foreground transition-colors p-2"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Active subscriptions list */}
        {state.subscriptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {state.subscriptions.map((sub) => {
              const Icon = getSubscriptionIcon(sub.slug);
              const isCustom = !SUGGESTED_SUB_SLUGS.has(sub.slug);
              return (
                <div
                  key={sub.slug}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-accent"
                >
                  <span className="text-sm text-primary font-medium flex items-center gap-1.5">
                    <Icon size={14} /> {sub.name}
                    {isCustom && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded-md">{t("custom")}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {symbol}{sub.amount}
                    </span>
                    <button
                      onClick={() => removeSub(sub.slug)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={t("delete")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Añadir suscripción personalizada */}
        {!showCustomSubForm ? (
          <button
            onClick={() => setShowCustomSubForm(true)}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border text-[13px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            <Plus size={14} />
            {t("addCustomSubscription")}
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent">
            <Input
              placeholder={t("customSubscriptionName")}
              value={customSubName}
              onChange={(e) => setCustomSubName(e.target.value)}
              className="h-11 text-base"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">{symbol}</span>
              <Input
                type="number"
                className="h-11 text-base flex-1"
                placeholder="0"
                value={customSubAmount}
                onChange={(e) => setCustomSubAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomSubscription(); }}
              />
              <span className="text-sm text-muted-foreground shrink-0">{t("perMonth")}</span>
              <Button
                size="sm"
                className="h-11 px-4 shrink-0"
                disabled={!customSubName.trim() || !customSubAmount || parseFloat(customSubAmount) <= 0}
                onClick={addCustomSubscription}
              >
                {t("addExpense")}
              </Button>
            </div>
            <button
              onClick={() => { setShowCustomSubForm(false); setCustomSubName(""); setCustomSubAmount(""); }}
              className="text-xs text-muted-foreground hover:text-foreground text-center py-1"
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Recurring expenses */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {t("onboardingRecurringExpenses")}
        </p>

        <div className="flex flex-col gap-1.5">
          {RECURRING_EXPENSES.map((expense) => {
            const activeItem = state.recurringExpenses.find(
              (r) => r.slug === expense.slug
            );
            const isActive = !!activeItem;
            const Icon = getRecurringIcon(expense.slug, expense.category);
            return (
              <button
                key={expense.slug}
                onClick={() => handleRecurringClick(expense.slug)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                  isActive
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <span className="text-sm font-medium flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? "bg-primary/10" : "bg-secondary"
                  }`}>
                    <Icon size={14} className={isActive ? "text-primary" : "text-muted-foreground"} />
                  </span>
                  {expense.name}
                </span>
                {isActive ? (
                  <span className="text-sm font-bold text-primary">
                    {symbol}{activeItem.amount}/mes
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("tapToAdd")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom recurring expenses list (los que el usuario añadió manualmente
            con el formulario de gasto personalizado). Antes no se renderizaban
            en ningún lado y el usuario pensaba que no se habían guardado. */}
        {customRecurring.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            {customRecurring.map((r) => (
              <div
                key={r.slug}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-accent"
              >
                <span className="text-sm text-primary font-medium flex items-center gap-1.5">
                  <Plus size={14} /> {r.name}
                  <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded-md">{t("custom")}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {symbol}{r.amount}
                  </span>
                  <button
                    onClick={() => removeRecurring(r.slug)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t("delete")}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline price editor for recurring */}
        {editingRecurring && editingRecurringInfo && (() => {
          const Icon = getRecurringIcon(editingRecurringInfo.slug, editingRecurringInfo.category);
          return (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Icon size={14} className="text-primary" />
                {editingRecurringInfo.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">{symbol}</span>
                <Input
                  type="number"
                  className="h-11 text-base flex-1"
                  value={recurringPrice}
                  onChange={(e) => setRecurringPrice(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRecurring();
                    if (e.key === "Escape") cancelRecurring();
                  }}
                />
                <span className="text-sm text-muted-foreground shrink-0">{t("perMonth")}</span>
                <Button size="sm" className="h-11 px-4 shrink-0" onClick={confirmRecurring}>
                  OK
                </Button>
                <button
                  onClick={cancelRecurring}
                  className="text-muted-foreground hover:text-foreground transition-colors p-2"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Custom expense */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {t("addCustomExpense")}
        </p>

        {!showCustomForm ? (
          <button
            onClick={() => setShowCustomForm(true)}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            <Plus size={16} />
            {t("addCustomExpense")}
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-accent">
            <Input
              placeholder={t("customExpenseName")}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="h-11 text-base"
              autoFocus
            />
            <div className="flex gap-1.5 flex-wrap">
              {CUSTOM_CATEGORIES.map((cat) => {
                const Icon = getCategoryIcon(cat.slug);
                const selected = customCategory === cat.slug;
                return (
                  <button
                    key={cat.slug}
                    onClick={() => setCustomCategory(cat.slug)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-background border border-border"
                    }`}
                  >
                    <Icon size={12} /> {cat.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">{symbol}</span>
              <Input
                type="number"
                className="h-11 text-base flex-1"
                placeholder="0"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const price = parseFloat(customAmount);
                    if (!customName.trim() || isNaN(price) || price <= 0) return;
                    const slug = `custom-${customName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-${Date.now().toString(36)}`;
                    const newRecurring: ActiveRecurring = {
                      name: customName.trim(),
                      slug,
                      amount: price,
                      icon: "",
                      category: customCategory,
                    };
                    onUpdate({ recurringExpenses: [...state.recurringExpenses, newRecurring] });
                    setCustomName(""); setCustomAmount(""); setCustomCategory("otros"); setShowCustomForm(false);
                  }
                }}
              />
              <span className="text-sm text-muted-foreground shrink-0">{t("perMonth")}</span>
              <Button
                size="sm"
                className="h-11 px-4 shrink-0"
                disabled={!customName.trim() || !customAmount || parseFloat(customAmount) <= 0}
                onClick={() => {
                  const price = parseFloat(customAmount);
                  if (!customName.trim() || isNaN(price) || price <= 0) return;
                  const slug = customName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                  const newRecurring: ActiveRecurring = {
                    name: customName.trim(),
                    slug,
                    amount: price,
                    icon: "",
                    category: customCategory,
                  };
                  onUpdate({ recurringExpenses: [...state.recurringExpenses, newRecurring] });
                  setCustomName(""); setCustomAmount(""); setCustomCategory("otros"); setShowCustomForm(false);
                }}
              >
                {t("addExpense")}
              </Button>
            </div>
            <button
              onClick={() => { setShowCustomForm(false); setCustomName(""); setCustomAmount(""); }}
              className="text-xs text-muted-foreground hover:text-foreground text-center py-1"
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      {/* Total box */}
      <div className="mt-4 p-4 rounded-xl bg-accent text-center">
        <p className="text-xs text-muted-foreground mb-1">{t("totalFixedExpenses")}</p>
        <p className="text-2xl font-bold text-primary">
          {symbol}{total.toLocaleString()}
        </p>
      </div>

      <Button className="w-full" size="lg" onClick={onNext}>
        {t("nextArrow")}
      </Button>

      <button
        type="button"
        onClick={onNext}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center mx-auto"
      >
        {t("continueWithoutExpenses")}
      </button>
    </div>
  );
}
