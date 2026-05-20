"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "motion/react";
import { ChevronDown, ChevronRight, Plus, AlertCircle, Wallet, TrendingUp, Upload } from "lucide-react";
import { FintrkLogo } from "@/components/fintrk-logo";
import { prefersReducedMotion } from "@/lib/premium/motion";
import { getCurrencySymbol } from "@/lib/currency";
import { AnimatedNumber } from "@/components/animated-number";
import { normalizeAccountColor } from "@/lib/account-color";
import { BankLogo, BANK_LOGOS } from "@/components/bank-logos";
import { useT, useLocaleCode } from "@/lib/i18n";

type InterestPaymentFrequency = "daily" | "monthly" | "quarterly" | "annual";

interface Account {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  initial_balance: number;
  current_balance: number;
  total_income: number;
  total_expenses: number;
  transaction_count: number;
  currency: string;
  color: string;
  is_active: number;
  annual_interest_rate: number;
  interest_payment_frequency: InterestPaymentFrequency | null;
  scope: string;
  scope_label: string | null;
  created_at: string;
}

interface UnassignedData {
  total_income: number;
  total_expenses: number;
  transaction_count: number;
}

interface AccountsData {
  accounts: Account[];
  totalBalance: number;
  unassigned: UnassignedData;
}

function fmtCompact(amount: number, currency?: string | null, localeCode = "es-ES"): string {
  const symbol = getCurrencySymbol(currency);
  const abs = Math.abs(amount);
  const formatted =
    abs % 1 === 0
      ? abs.toLocaleString(localeCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : abs.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

function AccountIcon({ name, color, slug }: { name: string; color: string; slug?: string }) {
  const bankSlug = slug ?? name.toLowerCase().replace(/\s+/g, "");
  if (BANK_LOGOS[bankSlug]) {
    return <BankLogo bank={bankSlug} size={44} className="shrink-0 rounded-xl shadow-lg" />;
  }
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}dd)`,
        boxShadow: `0 4px 12px ${color}40`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ---------- Account Card ---------- */
function AccountCard({
  account,
  isOpen,
  onToggle,
  onRefresh,
}: {
  account: Account;
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(account.name);
  const [editBalance, setEditBalance] = useState((Math.round(account.current_balance * 100) / 100).toFixed(2));
  const [editScope, setEditScope] = useState(account.scope || "personal");
  const [editScopeLabel, setEditScopeLabel] = useState(account.scope_label || "");
  const [editRemunerated, setEditRemunerated] = useState((account.annual_interest_rate ?? 0) > 0);
  const [editInterestRate, setEditInterestRate] = useState(account.annual_interest_rate ? String(Math.round(account.annual_interest_rate * 10000) / 100) : "");
  const [editInterestFreq, setEditInterestFreq] = useState<InterestPaymentFrequency>(account.interest_payment_frequency ?? "monthly");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const t = useT();
  const localeCode = useLocaleCode();
  const fmtC = (amount: number, currency = "EUR") => fmtCompact(amount, currency, localeCode);
  // Normaliza morados/índigo de cuentas pre-brand-rule. Un solo punto de
  // verdad para toda la card — background, border, icon bg, slider, etc.
  const color = normalizeAccountColor(account.color);

  // Resync edit state when account data changes (after refresh)
  useEffect(() => {
    if (!editMode) {
      setEditName(account.name);
      setEditBalance((Math.round(account.current_balance * 100) / 100).toFixed(2));
      setEditScope(account.scope || "personal");
      setEditScopeLabel(account.scope_label || "");
      setEditRemunerated((account.annual_interest_rate ?? 0) > 0);
      setEditInterestRate(account.annual_interest_rate ? String(Math.round(account.annual_interest_rate * 10000) / 100) : "");
      setEditInterestFreq(account.interest_payment_frequency ?? "monthly");
    }
  }, [account, editMode]);

  const balancePositive = account.current_balance >= 0;

  async function handleSave() {
    setSaving(true);
    try {
      const target = parseFloat(editBalance);
      if (isNaN(target)) { setSaving(false); return; }

      // Recalculate initial_balance so that initial + transactions = target
      const txBalance = account.current_balance - account.initial_balance;
      const newInitial = Math.round((target - txBalance) * 100) / 100;

      const parsedRate = parseFloat(editInterestRate);
      const annualInterestRate = editRemunerated && !isNaN(parsedRate) && parsedRate > 0
        ? parsedRate / 100
        : 0;

      const res = await apiFetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          emoji: "",
          initial_balance: newInitial,
          color,
          scope: editScope === "custom" ? "personal" : editScope,
          scope_label: editScopeLabel || null,
          annual_interest_rate: annualInterestRate,
          interest_payment_frequency: editInterestFreq,
        }),
      });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("error")); return; }
      const { toast } = await import("sonner");
      toast.success(t("accountUpdated"));
      setEditMode(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("error")); return; }
    setConfirmDelete(false);
    onRefresh();
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, ${color}12 0%, ${color}06 100%)`,
        border: `1px solid ${color}25`,
      }}
    >
      {/* Header */}
      <button
        className="w-full text-left px-4 py-4 active:scale-[0.99] transition-transform"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AccountIcon name={account.name} color={color} slug={account.slug} />
            <div>
              <div className="font-semibold text-[15px]">{account.name}</div>
              {(account.annual_interest_rate ?? 0) > 0 && (
                <div className="text-[10px] text-[#2D6A4F] font-medium">
                  {t("remunerated")} · {Math.round(account.annual_interest_rate * 10000) / 100}% TAE
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`text-lg font-bold tabular-nums ${balancePositive ? "text-foreground" : "text-red-400"}`}>
              {account.current_balance < 0 ? "-" : ""}
              {fmtC(account.current_balance, account.currency)}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </button>

      {/* Expanded panel */}
      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1" style={{ borderTop: `1px solid ${color}15` }}>
            {!editMode && (
              <>
                {/* Income / Expense */}
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 rounded-xl bg-[#2D6A4F]/10 px-3 py-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground tracking-wider mb-0.5">{t("totalIncome")}</div>
                    <div className="text-sm font-semibold text-[#2D6A4F]">+{fmtC(account.total_income, account.currency)}</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-red-500/10 px-3 py-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground tracking-wider mb-0.5">{t("totalExpenses")}</div>
                    <div className="text-sm font-semibold text-red-400">-{fmtC(account.total_expenses, account.currency)}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditMode(true);
                      setEditName(account.name);
                      setEditBalance((Math.round(account.current_balance * 100) / 100).toFixed(2));
                      setEditScope(account.scope || "personal");
                      setEditRemunerated((account.annual_interest_rate ?? 0) > 0);
                      setEditInterestRate(account.annual_interest_rate ? String(Math.round(account.annual_interest_rate * 10000) / 100) : "");
                      setEditInterestFreq(account.interest_payment_frequency ?? "monthly");
                      setConfirmDelete(false);
                    }}
                    className="text-xs h-8 px-3 rounded-lg"
                  >
                    {t("edit")}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-8 px-3 rounded-lg" asChild>
                    <Link href={`/transactions?account=${account.slug}`}>{t("viewMovements")}</Link>
                  </Button>

                  {!confirmDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                      className="text-xs h-8 px-3 rounded-lg text-red-400/50 hover:text-red-400 ml-auto"
                    >
                      {t("delete")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-red-400">{t("confirm")}?</span>
                      <Button size="sm" onClick={handleDelete} className="text-xs h-7 px-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg">{t("yes")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="text-xs h-7 px-2.5 rounded-lg">{t("no")}</Button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Edit mode — unified: name, balance, scope */}
            {editMode && (
              <div className="flex flex-col gap-3 animate-in">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">{t("name")}</label>
                  <Input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("accountName")} />
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">{t("currentBalance")}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-light text-muted-foreground">{getCurrencySymbol(account.currency)}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={editBalance}
                      onChange={(e) => setEditBalance(e.target.value)}
                      placeholder="0"
                      className="text-xl font-bold h-11 flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">{t("type")}</label>
                  <div className="flex gap-1.5 flex-wrap bg-muted/40 p-1 rounded-xl">
                    {[
                      { value: "personal", label: t("personal") },
                      { value: "business", label: t("company") },
                      { value: "shared", label: t("shared") },
                      { value: "savings", label: t("savingsAccount") },
                      { value: "custom", label: t("other") },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setEditScope(opt.value); if (opt.value !== "custom") setEditScopeLabel(""); }}
                        className={`text-xs font-medium py-2 px-3 rounded-lg transition-all ${
                          editScope === opt.value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {(editScope === "shared" || editScope === "custom") && (
                    <Input
                      className="mt-2 h-9 text-sm"
                      placeholder={editScope === "shared" ? t("sharedWithPlaceholder") : t("customScopePlaceholder")}
                      value={editScopeLabel}
                      onChange={(e) => setEditScopeLabel(e.target.value)}
                    />
                  )}
                </div>

                {/* Cuenta remunerada */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editRemunerated}
                      onChange={(e) => setEditRemunerated(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-[#2D6A4F]"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <TrendingUp className="h-4 w-4 text-[#2D6A4F]" />
                      <span className="text-sm font-medium">{t("remuneratedAccount")}</span>
                    </div>
                  </label>

                  {editRemunerated && (
                    <div className="mt-3 flex flex-col gap-3 pl-7">
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-1 block">{t("annualRate")}</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max="100"
                            value={editInterestRate}
                            onChange={(e) => setEditInterestRate(e.target.value)}
                            placeholder="Ej: 2.5"
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-1 block">{t("paymentFrequency")}</label>
                        <Select value={editInterestFreq} onValueChange={(v) => setEditInterestFreq(v as InterestPaymentFrequency)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">{t("daily")}</SelectItem>
                            <SelectItem value="monthly">{t("monthly")}</SelectItem>
                            <SelectItem value="quarterly">{t("quarterly")}</SelectItem>
                            <SelectItem value="annual">{t("annual")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">{saving ? t("saving") : t("save")}</Button>
                  <Button variant="outline" onClick={() => setEditMode(false)}>{t("cancel")}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Skeletons ---------- */
function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-border/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- PRESETS ---------- */
const BANK_PRESETS = [
  { name: "Revolut", slug: "revolut", color: "#635bff" },
  { name: "BBVA", slug: "bbva", color: "#004481" },
  { name: "ING", slug: "ing", color: "#ff6200" },
  { name: "CaixaBank", slug: "caixabank", color: "#007ec3" },
  { name: "Santander", slug: "santander", color: "#ec0000" },
  { name: "N26", slug: "n26", color: "#36a18b" },
  { name: "Wise", slug: "wise", color: "#9fe870" },
  { name: "MyInvestor", slug: "myinvestor", color: "#00b4d8" },
] as const;

/* ---------- Main Page ---------- */
export default function AccountsPage() {
  const t = useT();
  const router = useRouter();
  const localeCode = useLocaleCode();
  const fmtC = (amount: number, currency = "EUR") => fmtCompact(amount, currency, localeCode);
  const { data, loading, refresh } = useFetch<AccountsData>("/api/accounts?transactions=0");
  const interestChecked = useRef(false);

  // Auto-calculate interest on remunerated accounts
  useEffect(() => {
    if (interestChecked.current || !data) return;
    const hasRemunerated = data.accounts.some(a => (a.annual_interest_rate ?? 0) > 0);
    if (hasRemunerated) {
      interestChecked.current = true;
      apiFetch("/api/interest", { method: "POST" })
        .then(r => r.json())
        .then(result => {
          if (result.created > 0) refresh();
        })
        .catch(() => {});
    }
  }, [data, refresh]);
  const accounts = data?.accounts ?? [];
  const totalBalance = data?.totalBalance ?? 0;
  const unassigned = data?.unassigned ?? { total_income: 0, total_expenses: 0, transaction_count: 0 };

  // Derivamos la moneda "primaria" del usuario mirando sus cuentas. Si todas
  // tienen la misma moneda, usamos esa. Si hay mezcla (un usuario con cuentas
  // en EUR y USD, por ejemplo) caemos a la primera — el Total balance es
  // informativo y el usuario puede ver el desglose por cuenta más abajo.
  const primaryCurrency = accounts[0]?.currency ?? "EUR";

  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [unassignedTxs, setUnassignedTxs] = useState<Array<{ id: number; date: string; description: string; eur_amount: number; direction: "income" | "expense"; category: string }> | null>(null);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedAction, setUnassignedAction] = useState<"reassign" | "delete" | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newCurrency, setNewCurrency] = useState("EUR");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [newIsRemunerated, setNewIsRemunerated] = useState(false);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [newInterestFrequency, setNewInterestFrequency] = useState<InterestPaymentFrequency>("monthly");
  const [newScope, setNewScope] = useState<"personal" | "business">("personal");
  const [creating, setCreating] = useState(false);

  const existingSlugs = new Set(accounts.map((a) => a.slug));
  const availablePresets = BANK_PRESETS.filter((p) => !existingSlugs.has(p.slug));

  function selectPreset(preset: typeof BANK_PRESETS[number]) {
    setNewName(preset.name);
    setNewSlug(preset.slug);
    setNewColor(preset.color);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const slug = newSlug || newName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!newName || !slug) return;

    // Convert % input to decimal (user enters 2.5 for 2.5% APR → 0.025)
    const parsedRate = parseFloat(newInterestRate);
    const annualInterestRate = newIsRemunerated && !isNaN(parsedRate) && parsedRate > 0
      ? parsedRate / 100
      : 0;

    setCreating(true);
    try {
      const res = await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: newName,
          emoji: "",
          initial_balance: parseFloat(newBalance) || 0,
          currency: newCurrency,
          color: newColor,
          annual_interest_rate: annualInterestRate,
          interest_payment_frequency: newInterestFrequency,
          scope: newScope,
        }),
      });
      const { toast } = await import("sonner");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        toast.error(err.error || t("error"));
        return;
      }
      toast.success(t("accountCreated"));
      setNewName(""); setNewSlug(""); setNewBalance(""); setNewCurrency("EUR"); setNewColor("#3b82f6");
      setNewIsRemunerated(false); setNewInterestRate(""); setNewInterestFrequency("monthly"); setNewScope("personal");
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      console.error("Account creation client error:", e);
      const { toast } = await import("sonner");
      toast.error(t("connectionError"));
    } finally {
      setCreating(false);
    }
  }

  const unassignedCount = unassigned.transaction_count;

  return (
    <div className="animate-in animate-stagger">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">{t("accounts")}</h1>
        <Button
          size="sm"
          className="rounded-xl bg-primary hover:bg-primary/90"
          data-tour="accounts-create"
          onClick={() => router.push("/accounts/new")}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("addAccount")}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <span className="hidden" />
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("newAccount")}</DialogTitle>
            </DialogHeader>

            {/* Bank presets */}
            {availablePresets.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-muted-foreground mb-2">{t("popularBanks")}</p>
                <div className="flex flex-wrap gap-2">
                  {availablePresets.map((preset) => (
                    <button
                      key={preset.slug}
                      type="button"
                      onClick={() => selectPreset(preset)}
                      className={`flex items-center gap-2 py-2 px-3 rounded-full text-xs font-medium transition-all ${
                        newSlug === preset.slug
                          ? "ring-1 ring-[#2D6A4F]/30 bg-[#2D6A4F]/15 text-foreground"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {BANK_LOGOS[preset.slug] ? (
                        <BankLogo bank={preset.slug} size={16} />
                      ) : (
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: preset.color }} />
                      )}
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleCreate} className="flex flex-col gap-3 mt-1">
              <div className="flex gap-2 items-center">
                <AccountIcon name={newName || "?"} color={newColor} />
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (!newSlug || BANK_PRESETS.some((p) => p.slug === newSlug))
                      setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                  }}
                  placeholder={t("accountName")}
                  required
                  className="flex-1"
                />
              </div>

              {/* Personal / Business scope */}
              <div className="flex gap-2 bg-muted/40 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setNewScope("personal")}
                  className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg transition-all ${
                    newScope === "personal"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("personal")}
                </button>
                <button
                  type="button"
                  onClick={() => setNewScope("business")}
                  className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg transition-all ${
                    newScope === "business"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("company")}
                </button>
              </div>

              {/* Balance — the key feature */}
              <div className="rounded-xl border border-[#2D6A4F]/20 bg-[#2D6A4F]/5 p-4">
                <p className="text-xs text-muted-foreground mb-2">{t("howMuchInAccount")}</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-light text-muted-foreground">{getCurrencySymbol(newCurrency)}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="0"
                    className="text-2xl font-bold h-12 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {t("putCurrentBalance")}
                </p>
              </div>

              {/* Import statement option */}
              <Link
                href={`/import?account=${newSlug || newName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
                onClick={(e) => {
                  if (!newName) { e.preventDefault(); return; }
                  // Create account first, then navigate to import
                  e.preventDefault();
                  handleCreate({ preventDefault: () => {} } as React.FormEvent).then(() => {
                    const slug = newSlug || newName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                    window.location.href = `/import?account=${slug}`;
                  });
                }}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-all"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#2D6A4F]/10 shrink-0">
                  <Upload size={16} className="text-[#2D6A4F]" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("importStatement")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("importStatementDesc")}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground" />
              </Link>

              <div className="flex gap-2">
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-background">
                  <label className="text-xs text-muted-foreground">Color</label>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-7 h-5 rounded cursor-pointer border-0 bg-transparent"
                  />
                </div>
              </div>

              {/* Remunerated account toggle */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsRemunerated}
                    onChange={(e) => setNewIsRemunerated(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-[#2D6A4F]"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <TrendingUp className="h-4 w-4 text-[#2D6A4F]" />
                    <span className="text-sm font-medium">{t("remuneratedAccount")}</span>
                  </div>
                </label>

                {newIsRemunerated && (
                  <div className="mt-3 flex flex-col gap-3 pl-7">
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">{t("annualRate")}</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max="100"
                          value={newInterestRate}
                          onChange={(e) => setNewInterestRate(e.target.value)}
                          placeholder="Ej: 2.5"
                          className="flex-1"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">{t("paymentFrequency")}</label>
                      <Select
                        value={newInterestFrequency}
                        onValueChange={(v) => setNewInterestFrequency(v as InterestPaymentFrequency)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">{t("daily")}</SelectItem>
                          <SelectItem value="monthly">{t("monthly")}</SelectItem>
                          <SelectItem value="quarterly">{t("quarterly")}</SelectItem>
                          <SelectItem value="annual">{t("annual")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <p className="text-[10px] text-muted-foreground/70">
                      Fintrk calculará los intereses automáticamente sobre tu saldo y los añadirá como ingreso cuando toque el pago.
                    </p>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={creating} className="h-12 rounded-xl bg-primary hover:bg-primary/90 font-semibold">
                {creating ? t("loading") : t("createAccount2")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Total balance */}
      <div className="rounded-2xl mb-6 p-5 bg-gradient-to-br from-[#2D6A4F]/10 via-[#2D6A4F]/5 to-transparent border border-[#2D6A4F]/10 relative overflow-hidden">
        <span className="absolute top-3 right-4 opacity-10 pointer-events-none select-none">
          <FintrkLogo size="md" />
        </span>
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-40" />
          </div>
        ) : (
          <div className="relative">
            <div className="text-muted-foreground text-[11px] tracking-wide mb-1">{t("totalBalance")}</div>
            <motion.div
              className={`text-4xl font-bold tabular-nums tracking-tight ${totalBalance >= 0 ? "text-foreground" : "text-red-400"}`}
              animate={prefersReducedMotion() ? undefined : { scale: [1, 1.005, 1] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              {totalBalance < 0 ? "-" : ""}
              <AnimatedNumber
                value={Math.abs(totalBalance)}
                prefix={getCurrencySymbol(primaryCurrency)}
                formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 2 }}
              />
            </motion.div>
            <div className="text-xs text-muted-foreground mt-1">
              {accounts.length} {t("accounts").toLowerCase()}
            </div>

            {/* Color bar */}
            {accounts.length > 0 && (
              <div className="flex gap-1 mt-4 h-1.5 rounded-full overflow-hidden bg-border/30">
                {accounts.map((a) => {
                  const pct = totalBalance > 0
                    ? Math.max((Math.max(a.current_balance, 0) / totalBalance) * 100, 3)
                    : 100 / accounts.length;
                  return (
                    <div
                      key={a.id}
                      style={{ width: `${pct}%`, backgroundColor: a.color }}
                      className="rounded-full min-w-[6px] transition-all duration-500"
                      title={`${a.name}: ${fmtC(a.current_balance, a.currency)}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unassigned — expandable card with bulk actions */}
      {!loading && unassignedCount > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <button
            onClick={async () => {
              const next = !unassignedOpen;
              setUnassignedOpen(next);
              if (next && !unassignedTxs) {
                setUnassignedLoading(true);
                try {
                  const res = await apiFetch("/api/transactions/unassigned");
                  const data = await res.json();
                  setUnassignedTxs(data.transactions ?? []);
                } catch { /* ignore */ }
                setUnassignedLoading(false);
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-amber-500/10 transition-colors"
          >
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {unassignedCount} movimiento{unassignedCount === 1 ? "" : "s"} sin cuenta
              </p>
              <p className="text-[11px] text-amber-800/70 mt-0.5">
                Quedaron huérfanos al borrar una cuenta. Asígnalos o bórralos.
              </p>
            </div>
            <ChevronDown size={16} className={`text-amber-700 transition-transform ${unassignedOpen ? "rotate-180" : ""}`} />
          </button>

          {unassignedOpen && (
            <div className="border-t border-amber-500/20 px-4 py-3 space-y-3">
              {/* Transaction list */}
              {unassignedLoading ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : unassignedTxs && unassignedTxs.length > 0 ? (
                <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl bg-background/60 p-2">
                  {unassignedTxs.map((tx) => {
                    const d = new Date(tx.date + "T00:00:00");
                    return (
                      <div key={tx.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{tx.description || tx.category}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {d.toLocaleDateString(localeCode, { day: "numeric", month: "short" })} · {tx.category}
                          </p>
                        </div>
                        <span className={`font-bold tabular-nums shrink-0 ${tx.direction === "income" ? "text-[#2D6A4F]" : "text-foreground"}`}>
                          {tx.direction === "income" ? "+" : "-"}{getCurrencySymbol(primaryCurrency)}{tx.eur_amount.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">No se pudo cargar el detalle.</p>
              )}

              {/* Action: reassign */}
              {accounts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-amber-900">Asignar todos a una cuenta</p>
                  <div className="flex gap-2">
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger className="flex-1 h-10 rounded-xl bg-background">
                        <SelectValue placeholder="Elige cuenta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.slug} value={a.slug}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-10 rounded-xl bg-primary hover:bg-primary/90"
                      disabled={!reassignTo || unassignedAction !== null}
                      onClick={async () => {
                        setUnassignedAction("reassign");
                        try {
                          const res = await apiFetch("/api/transactions/unassigned", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "reassign", accountSlug: reassignTo }),
                          });
                          const data = await res.json();
                          const { toast } = await import("sonner");
                          if (res.ok) {
                            toast.success(`${data.reassigned} movimientos asignados`);
                            setUnassignedOpen(false);
                            setUnassignedTxs(null);
                            setReassignTo("");
                            await refresh();
                          } else {
                            toast.error(data.error || "Error");
                          }
                        } catch {
                          const { toast } = await import("sonner");
                          toast.error("Error de conexión");
                        }
                        setUnassignedAction(null);
                      }}
                    >
                      {unassignedAction === "reassign" ? "Asignando..." : "Asignar"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Action: delete all */}
              <div className="pt-2 border-t border-amber-500/20">
                <button
                  onClick={async () => {
                    if (!confirm(`¿Borrar ${unassignedCount} movimiento${unassignedCount === 1 ? "" : "s"} sin cuenta? No se puede deshacer.`)) return;
                    setUnassignedAction("delete");
                    try {
                      const res = await apiFetch("/api/transactions/unassigned", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "delete" }),
                      });
                      const data = await res.json();
                      const { toast } = await import("sonner");
                      if (res.ok) {
                        toast.success(`${data.deleted} movimientos borrados`);
                        setUnassignedOpen(false);
                        setUnassignedTxs(null);
                        await refresh();
                      } else {
                        toast.error(data.error || "Error");
                      }
                    } catch {
                      const { toast } = await import("sonner");
                      toast.error("Error de conexión");
                    }
                    setUnassignedAction(null);
                  }}
                  disabled={unassignedAction !== null}
                  className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                >
                  {unassignedAction === "delete" ? "Borrando..." : "Borrar todos los movimientos sin cuenta"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account cards — grouped by scope */}
      {loading ? (
        <AccountsSkeleton />
      ) : (() => {
        const personal = accounts.filter(a => a.scope !== "business");
        const business = accounts.filter(a => a.scope === "business");
        const personalTotal = personal.reduce((s, a) => s + a.current_balance, 0);
        const businessTotal = business.reduce((s, a) => s + a.current_balance, 0);

        return (
          <div className="flex flex-col gap-5">
            {personal.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] text-muted-foreground tracking-wide">{t("personal").toUpperCase()}</p>
                  <p className="text-xs font-semibold tabular-nums">{fmtC(personalTotal, primaryCurrency)}</p>
                </div>
                <div className="flex flex-col gap-3">
                  {personal.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isOpen={openPanel === account.slug}
                      onToggle={() => setOpenPanel(openPanel === account.slug ? null : account.slug)}
                      onRefresh={refresh}
                    />
                  ))}
                </div>
              </div>
            )}
            {business.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] text-muted-foreground tracking-wide">{t("company").toUpperCase()}</p>
                  <p className="text-xs font-semibold tabular-nums">{fmtC(businessTotal, primaryCurrency)}</p>
                </div>
                <div className="flex flex-col gap-3">
                  {business.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isOpen={openPanel === account.slug}
                      onToggle={() => setOpenPanel(openPanel === account.slug ? null : account.slug)}
                      onRefresh={refresh}
                    />
                  ))}
                </div>
              </div>
            )}
            {personal.length === 0 && business.length === 0 && (
              <div className="flex flex-col gap-3">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    isOpen={openPanel === account.slug}
                    onToggle={() => setOpenPanel(openPanel === account.slug ? null : account.slug)}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {!loading && accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-5">
          <div className="rounded-2xl bg-muted/40 p-5">
            <Wallet className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-lg font-semibold mb-1">Anade tu primera cuenta</p>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Solo dinos cuánto tienes en cada cuenta. Sin extractos, sin complicaciones.
            </p>
          </div>
          <Button onClick={() => router.push("/accounts/new")} className="h-11 rounded-xl bg-primary hover:bg-primary/90 font-semibold px-6 gap-2">
            <Plus size={18} />
            {t("addAccount")}
          </Button>
        </div>
      )}
    </div>
  );
}
