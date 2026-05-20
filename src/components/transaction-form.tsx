"use client";
import { apiFetch } from "@/lib/api";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Save, Plus, Calendar, FileText, Camera, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { haptic } from "@/lib/premium/haptics";
import { useT } from "@/lib/i18n";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountOption {
  slug: string;
  name: string;
  emoji: string;
  color: string;
}

interface FreqCategory {
  category: string;
  count: number;
}

interface TransactionFormProps {
  mode: "create" | "edit";
  initial?: {
    id?: number;
    amount: number;
    currency: string;
    eur_amount: number;
    direction: "income" | "expense";
    description: string;
    category: string;
    expense_type: string | null;
    date: string;
    account: string | null;
  };
  /**
   * Called after a successful edit save (once the "Changes saved" overlay
   * has had time to be seen). If provided, the form won't navigate by itself
   * — parent can exit the editing view and refresh as needed.
   */
  onSaved?: () => void;
}

export function TransactionForm({ mode, initial, onSaved }: TransactionFormProps) {
  const router = useRouter();
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [aiMsg, setAiMsg] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accountsData } = useFetch<{ accounts: AccountOption[] }>("/api/accounts");
  const accounts = (accountsData?.accounts ?? []).map((a) => ({
    slug: a.slug,
    name: a.name,
    color: a.color || "#3b82f6",
  }));

  // Fetch user's most used categories
  const { data: freqData } = useFetch<FreqCategory[]>("/api/categories/frequent");
  const frequentSlugs = (freqData ?? []).slice(0, 5).map((f) => f.category);

  const [direction, setDirection] = useState<"income" | "expense">(initial?.direction ?? "expense");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [expenseType, setExpenseType] = useState(initial?.expense_type ?? "discrecional");
  const [date, setDate] = useState(() => {
    if (initial?.date) return initial.date.slice(0, 10);
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [account, setAccount] = useState(initial?.account ?? "");

  async function handleAiScan(file: File) {
    setError("");
    setAiMsg("");
    setScanning(true);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const res = await apiFetch("/api/ai/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type || "image/jpeg" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("scanError"));
      }

      const data = await res.json();

      setDirection(data.direction);
      setAmount(String(data.amount));
      setCurrency(data.currency || "EUR");
      setDescription(data.description || "");
      setCategory(data.category || "");
      if (data.expense_type) setExpenseType(data.expense_type);
      if (data.date) setDate(data.date);

      const pct = Math.round((data.confidence || 0) * 100);
      setAiMsg(`IA: ${data.description} — ${data.direction === "expense" ? t("expense") : t("income")} de ${data.currency}${data.amount} (${pct}% ${t("confidence")}). ${t("reviewing")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scanImageError"));
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const allCategories = direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const allEntries = Object.entries(allCategories);

  // Split into frequent and rest
  const frequentEntries = allEntries.filter(([slug]) => frequentSlugs.includes(slug));
  const restEntries = allEntries.filter(([slug]) => !frequentSlugs.includes(slug));
  // If user has no history, show first 5 as "suggested"
  const hasFrequent = frequentEntries.length > 0;
  const primaryEntries = hasFrequent ? frequentEntries : allEntries.slice(0, 5);
  const secondaryEntries = hasFrequent ? restEntries : allEntries.slice(5);

  // If selected category is in secondary, always show all
  const selectedInSecondary = secondaryEntries.some(([slug]) => slug === category);
  const expanded = showAllCategories || selectedInSecondary;

  const labelClass = "text-[10px] tracking-wide text-muted-foreground mb-1.5 block";

  const saveTransaction = async (addAnother: boolean) => {
    setError("");
    setSuccessMsg("");
    setSaving(true);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t("amountMustBePositive"));
      setSaving(false);
      return;
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(t("invalidDate"));
      setSaving(false);
      return;
    }

    const payload = {
      amount: parsedAmount,
      currency,
      eur_amount: currency === "EUR" ? parsedAmount : parsedAmount,
      direction,
      description,
      category: category || (direction === "income" ? "otros-ingreso" : "otros"),
      expense_type: direction === "expense" ? expenseType : null,
      date,
      account: account || null,
    };

    try {
      const url = mode === "edit" ? `/api/transactions/${initial?.id}` : "/api/transactions";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("errorSaving"));
      }

      haptic.success();

      if (addAnother && mode === "create") {
        setAmount("");
        setDescription("");
        setCategory("");
        setSuccessMsg(`${direction === "expense" ? t("expense") : t("income")} de ${currency === "EUR" ? "\u20AC" : currency}${parsedAmount.toFixed(2)} ${t("savedExpense")}`);
        setTimeout(() => setSuccessMsg(""), 3000);
      } else if (mode === "create") {
        const data = await res.json();
        router.push(`/transactions/detail?id=${data.id}`);
        router.refresh();
      } else {
        // Show a big check overlay before navigating back so the user sees the save.
        setJustSaved(true);
        try {
          const { toast } = await import("sonner");
          toast.success(t("changesSaved"));
        } catch { /* ignore */ }
        setTimeout(() => {
          setJustSaved(false);
          if (onSaved) {
            onSaved();
          } else {
            router.push(`/transactions/detail?id=${initial?.id}`);
            router.refresh();
          }
        }, 900);
      }
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveTransaction(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* AI Scan */}
      {mode === "create" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAiScan(file);
            }}
          />
          <button
            type="button"
            disabled={scanning}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-3 text-sm font-medium text-primary disabled:opacity-60"
          >
            {scanning ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {t("analyzingWithAI")}
              </>
            ) : (
              <>
                <Camera size={20} />
                <span>{t("photoOrUpload")}</span>
                <Sparkles size={14} className="opacity-60" />
              </>
            )}
          </button>
          {aiMsg && (
            <div className="mt-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              <Sparkles size={12} className="inline mr-1" />
              {aiMsg}
            </div>
          )}
        </div>
      )}

      {/* Direction toggle */}
      <div>
        <span className={labelClass}>TIPO</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setDirection("expense"); setCategory(""); setShowAllCategories(false); }}
            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2 ${
              direction === "expense"
                ? "bg-[var(--expense)]/20 text-expense border-[var(--expense)]/40"
                : "bg-background border-border text-muted-foreground"
            }`}
          >
            <ArrowDownCircle size={16} />
            {t("expense")}
          </button>
          <button
            type="button"
            onClick={() => { setDirection("income"); setCategory(""); setShowAllCategories(false); }}
            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2 ${
              direction === "income"
                ? "bg-[var(--income)]/20 text-income border-[var(--income)]/40"
                : "bg-background border-border text-muted-foreground"
            }`}
          >
            <ArrowUpCircle size={16} />
            {t("income")}
          </button>
        </div>
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label className={labelClass}>CANTIDAD</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="text-xl sm:text-2xl font-bold h-12 sm:h-14"
            autoFocus={mode === "create"}
          />
        </div>
        <div>
          <Label className={labelClass}>MONEDA</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-12 sm:h-14">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <div>
        <Label className={labelClass}>
          <FileText size={10} className="inline mr-1" />
          DESCRIPCION
        </Label>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: Albert Heijn, Netflix..."
          required
        />
      </div>

      {/* Date */}
      <div>
        <Label className={labelClass}>
          <Calendar size={10} className="inline mr-1" />
          FECHA
        </Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Account */}
      {accounts.length > 0 && (
        <div>
          <Label className={labelClass}>CUENTA</Label>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
            {accounts.map((acc) => (
              <button
                key={acc.slug}
                type="button"
                onClick={() => setAccount(account === acc.slug ? "" : acc.slug)}
                className={`flex-shrink-0 py-2.5 px-3 rounded-lg text-xs font-medium transition-colors border flex items-center gap-2 ${
                  account === acc.slug
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: acc.color }}
                />
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category — frequent first, rest collapsed */}
      <div>
        <Label className={labelClass}>
          {hasFrequent ? t("frequentCategories") : t("categoryLabel")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {primaryEntries.map(([slug, info]) => (
            <button
              key={slug}
              type="button"
              onClick={() => setCategory(slug)}
              className={`flex items-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border ${
                category === slug
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} />
              {info.label}
            </button>
          ))}
        </div>

        {secondaryEntries.length > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setShowAllCategories(true)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown size={14} />
            {t("seeAllCategories")} ({secondaryEntries.length} {t("moreCategories")})
          </button>
        )}

        {expanded && secondaryEntries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            {secondaryEntries.map(([slug, info]) => (
              <button
                key={slug}
                type="button"
                onClick={() => setCategory(slug)}
                className={`flex items-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border ${
                  category === slug
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} />
                {info.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expense type (only for expenses) */}
      {direction === "expense" && (
        <div>
          <Label className={labelClass}>TIPO DE GASTO</Label>
          <div className="flex gap-2">
            {([["necesario", t("fixedLabel")], ["negocio", t("workLabel")], ["discrecional", t("treatsLabel")]] as [string, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setExpenseType(key)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                  expenseType === key
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="text-income text-sm bg-[var(--income)]/10 border border-[var(--income)]/20 rounded-lg px-3 py-2.5">
          {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-expense text-sm bg-[var(--expense)]/10 border border-[var(--expense)]/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="flex-1 h-12 text-base gap-2"
        >
          <Save size={16} />
          {saving ? t("saving") : mode === "edit" ? t("saveChanges") : t("save")}
        </Button>
        {mode === "create" && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => saveTransaction(true)}
            className="flex-1 h-12 text-sm gap-2"
          >
            <Plus size={16} />
            {t("saveAndAnother")}
          </Button>
        )}
      </div>
      {justSaved && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
        >
          <div className="flex flex-col items-center gap-4 animate-[scaleIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="w-24 h-24 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-2xl shadow-[#2D6A4F]/40">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
                <path
                  d="M14 27 L22 35 L38 18"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  style={{
                    strokeDasharray: 48,
                    strokeDashoffset: 48,
                    animation: "check-draw 0.45s ease-out 0.1s forwards",
                  }}
                />
              </svg>
            </div>
            <p className="text-base font-bold text-white drop-shadow-sm">{t("changesSaved")}</p>
          </div>
        </div>
      )}
    </form>
  );
}
