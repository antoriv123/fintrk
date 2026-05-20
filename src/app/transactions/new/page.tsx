"use client";
import { apiFetch, apiFetchOrQueue } from "@/lib/api";
import { useT, useLocaleCode } from "@/lib/i18n";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftRight, Camera, Sparkles, Loader2, X, Check, AlertCircle,
  ArrowDownCircle, ArrowUpCircle, ChevronRight, ImagePlus, Plus, Upload, Pencil, Repeat,
} from "lucide-react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { CategoryCreate } from "@/components/category-create";
import { suggestCategory } from "@/lib/auto-categorize";
import { defaultExpenseType, resolveAccountDefault } from "@/lib/ai-first";
import { getCurrencySymbol } from "@/lib/currency";
import { normalizeAccountColor } from "@/lib/account-color";
import { TransferForm } from "@/components/transfer-form";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/onboarding/confetti";
import { usePremium } from "@/components/premium/premium-provider";
import { ScanProgressOverlay } from "@/components/scan/scan-progress-overlay";

interface AccountOption { slug: string; name: string; emoji: string; color: string; }

export default function NewTransactionPage() {
  const router = useRouter();
  const t = useT();
  const [tab, setTab] = useState<"transaction" | "transfer">("transaction");
  return (
    <div
      className="animate-in flex flex-col overflow-hidden bg-background"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors active:scale-90">
          <X size={20} className="text-muted-foreground" />
        </button>
        <div className="flex bg-muted/50 rounded-full p-0.5">
          <button
            onClick={() => setTab("transaction")}
            aria-pressed={tab === "transaction"}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${tab === "transaction" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {t("expenseIncome")}
          </button>
          <button
            onClick={() => setTab("transfer")}
            aria-pressed={tab === "transfer"}
            aria-label={t("transfer")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${tab === "transfer" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <ArrowLeftRight size={12} /> <span className="hidden xs:inline sm:inline">{t("transfer")}</span>
          </button>
        </div>
        <div className="w-9" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "transaction" ? <TransactionFlow /> : <div className="px-4 py-4 h-full overflow-y-auto"><TransferForm /></div>}
      </div>
    </div>
  );
}

/*
  Flow steps:
  0: capture  — scan ticket / bank screenshot / manual
  1: amount   — confirm the amount
  2: name     — confirm description
  3: account  — select account
  4: category — select category
  5: type     — expense type (fijo/capricho/negocio) — only for expenses
  6: summary  — review & confirm
  7: done     — success animation
*/
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function TransactionFlow() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt2 = (n: number) =>
    n.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [slideDir, setSlideDir] = useState<"right" | "left" | "none">("none");
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<"ticket" | "bank" | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const bankRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const [multiProcessing, setMultiProcessing] = useState(false);
  const [multiProgress, setMultiProgress] = useState({ done: 0, total: 0 });
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);

  const premium = usePremium();
  const isScanningActive = scanning || multiProcessing;
  useEffect(() => {
    if (isScanningActive) premium.scanStarted();
    else premium.scanStopped();
    return () => { premium.scanStopped(); };
  }, [isScanningActive, premium]);

  const { data: accountsData } = useFetch<{ accounts: AccountOption[] }>("/api/accounts");
  const accounts = useMemo(() => accountsData?.accounts ?? [], [accountsData?.accounts]);
  const { data: customCatsData } = useFetch<{ categories: { slug: string; label: string; direction: string; icon?: string | null; color?: string | null }[] }>("/api/custom-categories");
  const customCategories = customCatsData?.categories ?? [];

  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  // Selector visual al crear categoria custom (PR #5). Defaults razonables:
  // CircleDot + verde marca. El user puede cambiarlos en el grid + paleta.
  const [customCategoryIcon, setCustomCategoryIcon] = useState("CircleDot");
  const [customCategoryColor, setCustomCategoryColor] = useState("#2D6A4F");
  const [expenseType, setExpenseType] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
  });
  const [aiUsed, setAiUsed] = useState(false);
  const [aiHighConfidence, setAiHighConfidence] = useState(false);
  const [editReturnToSummary, setEditReturnToSummary] = useState(false);

  // Transfer detection
  const [isTransfer, setIsTransfer] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [showTransferCheck, setShowTransferCheck] = useState(false);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<{ description: string; amount: number; date: string } | null>(null);
  const [duplicateChecked, setDuplicateChecked] = useState(false);

  // Mark-as-recurring (creates a fixed_expense / fixed_income after save)
  const [markAsRecurring, setMarkAsRecurring] = useState(false);
  const [recurringCycle, setRecurringCycle] = useState<"monthly" | "yearly" | "weekly">("monthly");
  const [recurringNextDate, setRecurringNextDate] = useState("");
  const [recurringAccount, setRecurringAccount] = useState("");

  // Recompute suggested next-renewal date whenever toggle/cycle/date change.
  useEffect(() => {
    if (!markAsRecurring) return;
    const base = new Date(date + "T00:00:00");
    if (Number.isNaN(base.getTime())) return;
    if (recurringCycle === "monthly") base.setMonth(base.getMonth() + 1);
    else if (recurringCycle === "yearly") base.setFullYear(base.getFullYear() + 1);
    else base.setDate(base.getDate() + 7);
    const iso = `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,"0")}-${String(base.getDate()).padStart(2,"0")}`;
    setRecurringNextDate(iso);
  }, [markAsRecurring, recurringCycle, date]);

  // Keep recurring account in sync with the transaction's account by default.
  useEffect(() => {
    if (markAsRecurring && !recurringAccount && account) setRecurringAccount(account);
  }, [markAsRecurring, account, recurringAccount]);

  // Multi-transaction flow (bank screenshots + multiple receipts)
  interface BankTx {
    description: string;
    amount: number;
    currency: string;
    direction: "income" | "expense";
    date: string;
    category: string;
    expense_type: string | null;
    account?: string | null;
    /** Selected for save (multi-tx review screen). */
    selected?: boolean;
    /** Flagged by duplicate detector. */
    duplicate?: boolean;
    duplicateOf?: { description: string; amount: number; date: string } | null;
  }
  const [bankQueue, setBankQueue] = useState<BankTx[]>([]);
  const [bankSaved, setBankSaved] = useState(0);
  const [bankTotal, setBankTotal] = useState(0);
  const [multiReview, setMultiReview] = useState<BankTx[] | null>(null);
  const [multiSaving, setMultiSaving] = useState(false);
  const [multiProgressSave, setMultiProgressSave] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (accounts.length === 1 && !account) setAccount(accounts[0].slug);
  }, [accounts, account]);

  function looksLikeTransfer(desc: string, cat: string): boolean {
    const d = desc.toLowerCase();
    const transferWords = ["transferencia", "transfer", "desde eur", "a eur", "ahorros", "savings", "vault", "pocket", "autotransferencia", "traspaso"];
    return cat === "transferencia" || transferWords.some(w => d.includes(w));
  }

  // Auto-advance: cuando el usuario selecciona cuenta/categoría/tipo con tap,
  // aplicamos un delay corto (150ms) para que se vea el highlight + el check
  // del item seleccionado y luego avanzamos al siguiente step. Evita tener
  // que bajar a pulsar "Siguiente" al final de la pantalla.
  function selectAndAdvance(action: () => void) {
    action();
    setTimeout(() => { void next(); }, 150);
  }

  async function next() {
    setError("");
    let nextStep = step + 1;

    // After category (step 4), save custom category if created
    if (step === 4 && category === "_custom" && customCategory.trim()) {
      const slug = customCategory.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      apiFetch("/api/custom-categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: customCategory.trim(),
          direction,
          icon: customCategoryIcon,
          color: customCategoryColor,
        }),
      }).catch(() => {});
      setCategory(slug);
    }

    // After name (step 2), auto-suggest category if not set
    if (step === 2 && (!category || category === "otros")) {
      const suggestion = suggestCategory(description);
      if (suggestion) {
        setCategory(suggestion.category);
        if (direction === "expense" && !expenseType) setExpenseType(suggestion.expenseType);
      }
    }

    // After name (step 2), check if it looks like a transfer
    if (step === 2 && looksLikeTransfer(description, category) && accounts.length >= 2 && !showTransferCheck) {
      setShowTransferCheck(true);
      setSlideDir("right");
      return; // Don't advance step, show transfer check overlay
    }

    // If transfer confirmed, skip to summary
    if (isTransfer && step === 2) {
      nextStep = 6; // go to summary
    }

    // Skip expense type step for income or transfers
    if (nextStep === 5 && (direction === "income" || isTransfer)) nextStep = 6;

    // Si venimos de editar desde summary, volver directo a summary tras confirmar
    if (editReturnToSummary && step < 6) {
      setEditReturnToSummary(false);
      setSlideDir("right");
      setStep(6);
      return;
    }

    setSlideDir("right");
    setStep(nextStep as Step);
  }
  function back() {
    setError("");
    if (showTransferCheck) { setShowTransferCheck(false); return; }
    let prevStep = step - 1;
    if (prevStep === 5 && (direction === "income" || isTransfer)) prevStep = 4;
    // If we came from transfer check to summary, go back to name
    if (isTransfer && step === 6) { prevStep = 2; setIsTransfer(false); }
    setSlideDir("left");
    setStep(prevStep as Step);
  }

  const slideClass = slideDir === "right"
    ? "animate-[slideInRight_0.3s_ease-out]"
    : slideDir === "left"
    ? "animate-[slideInLeft_0.3s_ease-out]"
    : "animate-in";

  // Scans
  async function handleBankScan(file: File) {
    setError(""); setScanning(true); setScanType("bank"); setScanStartedAt(Date.now());
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((d,b) => d+String.fromCharCode(b),""));
      const res = await apiFetch("/api/ai/scan-bank", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({image:b64, mimeType:file.type||"image/jpeg"}),
      });
      let data; try { data = await res.json(); } catch { throw new Error(t("serverError")); }
      if (!res.ok) throw new Error(data.error||"Error");
      const txs = (data.transactions ?? []) as Array<{
        description: string; amount: number; currency?: string;
        direction?: "income"|"expense"; date?: string; category?: string;
        expense_type?: string | null; confidence?: number;
      }>;
      if (txs.length === 0) throw new Error(t("noTransactionsInImage"));

      const normalised: BankTx[] = txs.map((tx) => {
        const dir: "income" | "expense" = tx.direction === "income" ? "income" : "expense";
        const cat = tx.category || (dir === "income" ? "otros-ingreso" : "otros");
        const expType = tx.expense_type || (dir === "expense" ? defaultExpenseType(cat) : null);
        const acc = resolveAccountDefault(null, accounts);
        return {
          description: tx.description || "",
          amount: tx.amount || 0,
          currency: tx.currency || "EUR",
          direction: dir,
          date: tx.date || date,
          category: cat,
          expense_type: expType,
          account: acc || null,
        };
      });

      await annotateDuplicates(normalised);

      if (normalised.length > 1) {
        setAiUsed(true);
        setMultiReview(normalised.map((tx) => ({ ...tx, selected: !tx.duplicate })));
        return;
      }

      const first = normalised[0];
      setDirection(first.direction); setAmount(String(first.amount));
      setDescription(first.description); setCategory(first.category);
      setCurrency(first.currency); if (first.date) setDate(first.date);
      if (first.expense_type) setExpenseType(first.expense_type);
      if (first.account) setAccount(first.account);
      setAiUsed(true);
      setBankTotal(1);
      setBankSaved(0);
      setBankQueue([]);
      if (first.duplicate && first.duplicateOf) setDuplicateWarning(first.duplicateOf);
      setSlideDir("right");
      setStep(6);
    } catch(e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setScanning(false); setScanType(null); setScanStartedAt(null); if(bankRef.current) bankRef.current.value=""; }
  }

  async function handleMultiScan(files: FileList) {
    setError(""); setMultiProcessing(true); setScanStartedAt(Date.now());
    setMultiProgress({ done: 0, total: files.length });
    const allTxs: (BankTx & { payment_method?: string | null; confidence?: number })[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const buf = await file.arrayBuffer();
        const b64 = btoa(new Uint8Array(buf).reduce((d,b) => d+String.fromCharCode(b),""));
        const res = await apiFetch("/api/ai/scan", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({image:b64, mimeType:file.type||"image/jpeg"}),
        });
        if (res.ok) {
          const data = await res.json();
          const dir: "income" | "expense" = data.direction === "income" ? "income" : "expense";
          const cat = data.category || (dir === "income" ? "otros-ingreso" : "otros");
          const expType = data.expense_type || (dir === "expense" ? defaultExpenseType(cat) : null);
          const acc = resolveAccountDefault(data.payment_method ?? null, accounts);
          allTxs.push({
            description: data.description || "",
            amount: data.amount || 0,
            currency: data.currency || "EUR",
            direction: dir,
            date: data.date || date,
            category: cat,
            expense_type: expType,
            payment_method: data.payment_method ?? null,
            confidence: typeof data.confidence === "number" ? data.confidence : 0,
            account: acc || null,
          });
        }
      } catch { /* skip failed photos */ }
      setMultiProgress({ done: i + 1, total: files.length });
    }
    setMultiProcessing(false); setScanStartedAt(null);
    if (multiRef.current) multiRef.current.value = "";

    if (allTxs.length === 0) {
      setError(t("noTransactionsInImage"));
      return;
    }

    // Duplicate flagging — ask backend in parallel, mutate entries in place.
    await annotateDuplicates(allTxs);

    // Multi-tx flow → review screen with checkboxes.
    if (allTxs.length > 1) {
      setAiUsed(true);
      setMultiReview(allTxs.map((tx) => ({ ...tx, selected: !tx.duplicate })));
      return;
    }

    // Single tx — AI-first: always land on summary, defaults already in place.
    const first = allTxs[0];
    setDirection(first.direction); setAmount(String(first.amount));
    setDescription(first.description); setCategory(first.category);
    setCurrency(first.currency); if (first.date) setDate(first.date);
    if (first.expense_type) setExpenseType(first.expense_type);
    if (first.account) setAccount(first.account);
    setAiUsed(true);
    setAiHighConfidence((first.confidence ?? 0) >= 0.7);
    setBankTotal(1);
    setBankSaved(0);
    setBankQueue([]);
    if (first.duplicate && first.duplicateOf) {
      setDuplicateWarning(first.duplicateOf);
    }
    setSlideDir("right");
    setStep(6); // always summary; user taps Edit if anything is off
  }

  async function annotateDuplicates(txs: BankTx[]): Promise<void> {
    await Promise.all(
      txs.map(async (tx) => {
        try {
          const res = await apiFetch("/api/transactions/check-duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: tx.amount, description: tx.description, date: tx.date }),
          });
          const data = await res.json().catch(() => ({ duplicate: false }));
          if (data?.duplicate && data?.matches?.length > 0) {
            tx.duplicate = true;
            const m = data.matches[0];
            tx.duplicateOf = { description: m.description, amount: m.amount, date: m.date };
          }
        } catch { /* ignore */ }
      }),
    );
  }

  async function saveSelectedMulti(): Promise<void> {
    if (!multiReview) return;
    const toSave = multiReview.filter((tx) => tx.selected);
    if (toSave.length === 0) return;
    setMultiSaving(true);
    setMultiProgressSave({ done: 0, total: toSave.length });
    let saved = 0;
    for (const tx of toSave) {
      try {
        const payload = {
          amount: tx.amount,
          currency: tx.currency,
          eur_amount: tx.amount,
          direction: tx.direction,
          description: tx.description || (tx.direction === "income" ? t("income") : t("expense")),
          category: tx.category || (tx.direction === "income" ? "otros-ingreso" : "otros"),
          expense_type: tx.direction === "expense" ? tx.expense_type : null,
          date: tx.date,
          account: tx.account || null,
        };
        const res = await apiFetchOrQueue("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) saved++;
      } catch { /* skip failed */ }
      setMultiProgressSave((p) => ({ ...p, done: p.done + 1 }));
    }
    setMultiSaving(false);
    setMultiReview(null);
    setBankTotal(saved);
    setBankSaved(saved);
    setShowCelebration(true);
    try {
      const { toast } = await import("sonner");
      toast.success(`${saved} ${t("transactionsSaved")}`);
    } catch { /* ignore */ }
    setTimeout(() => router.push("/transactions"), 2000);
  }

  async function handleSave() {
    setSaving(true); setError("");
    try {
      // Check for duplicates before saving (skip if already confirmed)
      if (!isTransfer && !duplicateChecked && bankQueue.length === 0) {
        const dupRes = await apiFetch("/api/transactions/check-duplicate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, description, date }),
        });
        const dupData = await dupRes.json().catch(() => ({ duplicate: false }));
        if (dupData.duplicate && dupData.matches?.length > 0) {
          const match = dupData.matches[0];
          setDuplicateWarning({ description: match.description, amount: match.amount, date: match.date });
          setSaving(false);
          return;
        }
      }
      setDuplicateChecked(false);

      if (isTransfer) {
        // Save as transfer (queues offline automatically)
        const res = await apiFetchOrQueue("/api/transfers", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            amount:parseFloat(amount), currency,
            from_account:transferFrom, to_account:transferTo,
            description:description||t("internalTransfer"), date,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error||"Error"); }
      } else {
        const finalCategory = category === "_custom" ? (customCategory || "otros") : (category || "otros");
        const res = await apiFetchOrQueue("/api/transactions", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            amount:parseFloat(amount), currency, eur_amount:parseFloat(amount), direction,
            description:description||(direction==="income"?t("income"):t("expense")),
            category:finalCategory, expense_type:direction==="expense"?expenseType:null,
            date, account:account||null,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error||"Error"); }

        // Optional: also register as a recurring fixed expense / fixed income.
        if (markAsRecurring) {
          let nextRenewal = recurringNextDate;
          if (!nextRenewal) {
            const fallback = new Date(date + "T00:00:00");
            if (recurringCycle === "monthly") fallback.setMonth(fallback.getMonth() + 1);
            else if (recurringCycle === "yearly") fallback.setFullYear(fallback.getFullYear() + 1);
            else fallback.setDate(fallback.getDate() + 7);
            nextRenewal = `${fallback.getFullYear()}-${String(fallback.getMonth()+1).padStart(2,"0")}-${String(fallback.getDate()).padStart(2,"0")}`;
          }
          const dom = parseInt(nextRenewal.slice(8, 10), 10);
          const recurringType = direction === "income" ? "fixed_income" : "fixed_expense";
          apiFetch("/api/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: description || finalCategory,
              amount: parseFloat(amount),
              currency,
              category: finalCategory,
              billing_cycle: recurringCycle,
              next_renewal: nextRenewal,
              type: recurringType,
              day_of_month: Number.isFinite(dom) ? dom : null,
              account: recurringAccount || account || null,
            }),
          }).catch(() => { /* non-blocking: transaction already saved */ });
        }
      }

      // If there are more bank transactions in the queue, load the next one
      if (bankQueue.length > 0) {
        const nextTx = bankQueue[0];
        const remaining = bankQueue.slice(1);
        setDirection(nextTx.direction||"expense"); setAmount(String(nextTx.amount||""));
        setDescription(nextTx.description||""); setCategory(nextTx.category||"");
        setCurrency(nextTx.currency||"EUR"); if(nextTx.date) setDate(nextTx.date);
        if(nextTx.expense_type) setExpenseType(nextTx.expense_type); else setExpenseType("");
        setAccount(""); // reset account for each
        setBankQueue(remaining);
        setBankSaved(prev => prev + 1);
        setSaving(false);
        setSlideDir("right"); setStep(1);
      } else {
        if (bankTotal > 1) setBankSaved(prev => prev + 1);
        setSlideDir("right"); setStep(7);
        // Celebration: confetti + toast + haptic.
        setShowCelebration(true);
        // Antes mostrabamos un toast extra "Lo hicimos por ti" cuando la IA
        // categorizaba con alta confianza. Quitado a peticion: la celebracion
        // y el toast unico de "guardado" son suficientes — duplicar notifs en
        // un mismo gesto distrae del feedback principal.
        // Primer gasto de la vida (idempotente via seen-flag)
        premium.firstExpenseEver();
        try {
          const { toast } = await import("sonner");
          const savedAmount = `${direction === "income" ? "+" : "-"}${sym}${fmt2(parseFloat(amount))}`;
          toast.success(`${t("savedCelebration")} ${savedAmount}`);
        } catch {}
        setTimeout(() => router.push("/transactions"), 3500);
      }
    } catch(e) { setError(e instanceof Error ? e.message : "Error"); setSaving(false); }
  }

  const sym = getCurrencySymbol(currency);
  const allCats = direction==="income"? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  // Filter out "otros", "otros-ingreso", "transferencia" — user must pick a real category or create custom
  const catEntries = Object.entries(allCats).filter(([slug]) => !["otros", "otros-ingreso", "transferencia"].includes(slug));
  const selectedCatInfo = category && category !== "_custom"
    ? (allCats as Record<string,{label:string;icon:string;color:string}>)[category] ?? { label: category, icon: "CircleDot", color: "#71717a" }
    : null;
  const selectedAccount = accounts.find(a => a.slug === account);
  const totalSteps = direction === "income" ? 6 : 7; // capture doesn't count
  const progressStep = step === 0 ? 0 : step === 7 ? totalSteps : (direction === "income" && step >= 5 ? step : step);
  const progress = step === 0 ? 0 : step === 7 ? 100 : Math.round((progressStep / (totalSteps - 1)) * 100);

  return (
    <div className="px-4 h-full flex flex-col overflow-hidden">
      {/* Multi-transaction indicator */}
      {bankTotal > 1 && step > 0 && step < 7 && (
        <div className="text-center mt-2 mb-1 shrink-0">
          <span className="text-[10px] font-bold tracking-wide text-[#2D6A4F] bg-[#2D6A4F]/10 px-3 py-1 rounded-full">
            {t("transactionXofY").replace("{current}", String(bankSaved + 1)).replace("{total}", String(bankTotal))}
          </span>
        </div>
      )}

      {/* Progress */}
      {step > 0 && step < 7 && (
        <div className="h-1 bg-border rounded-full mx-6 my-3 overflow-hidden shrink-0">
          <div className="h-full bg-[#2D6A4F] rounded-full transition-all duration-500 ease-out" style={{width:`${progress}%`}} />
        </div>
      )}

      <input ref={bankRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleBankScan(f);}} />
      <input ref={multiRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{const f=e.target.files;if(f&&f.length>0)handleMultiScan(f);}} />

      {/* ── MULTI-TX REVIEW ── */}
      {multiReview && (
        <MultiReview
          items={multiReview}
          saving={multiSaving}
          progress={multiProgressSave}
          accounts={accounts}
          onCancel={() => setMultiReview(null)}
          onChange={(next) => setMultiReview(next)}
          onConfirm={saveSelectedMulti}
        />
      )}

      {/* ── STEP 0: CAPTURE ── */}
      {step===0 && (
        <div className={`${slideClass} flex flex-col items-center pt-8 gap-6`}>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold mb-1">{t("newTransaction")}</h1>
            <p className="text-sm text-muted-foreground">{t("chooseHow")}</p>
          </div>

          {(scanning || multiProcessing) ? (
            <ScanProgressOverlay
              open={scanning || multiProcessing}
              mode={multiProcessing ? "multi" : scanType === "bank" ? "bank" : "single"}
              startedAt={scanStartedAt ?? undefined}
              done={multiProgress.done}
              total={multiProgress.total}
            />
          ) : (
            <div className="w-full space-y-3">
              <button onClick={()=>multiRef.current?.click()}
                data-tour="add-scan"
                className="w-full rounded-3xl bg-gradient-to-br from-[#2D6A4F] to-[#1B4332] p-6 flex items-center gap-5 active:scale-[0.97] transition-all shadow-xl shadow-[#2D6A4F]/25">
                <span className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <Camera size={26} className="text-white" />
                </span>
                <div className="text-left">
                  <p className="text-base font-bold text-white">{t("scanReceiptsButton")}</p>
                  <p className="text-xs text-white/60 mt-0.5">{t("scanReceiptsButtonDesc")}</p>
                </div>
              </button>
              <button onClick={()=>bankRef.current?.click()}
                data-tour="add-bank"
                className="w-full rounded-2xl border border-border bg-card p-5 flex items-center gap-4 active:scale-[0.97] transition-all shadow-sm">
                <span className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <ImagePlus size={22} className="text-muted-foreground" />
                </span>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold">{t("bankScreenshot")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("bankScreenshotDesc")}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/30" />
              </button>
              <button onClick={()=>{setSlideDir("right");setStep(1);}}
                data-tour="add-manual"
                className="w-full rounded-2xl border border-border bg-card p-5 flex items-center gap-4 active:scale-[0.97] transition-all shadow-sm">
                <span className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Plus size={22} className="text-muted-foreground" />
                </span>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold">{t("addManual")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("addManualDesc")}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/30" />
              </button>
              <Link href="/import"
                className="w-full rounded-2xl border border-border bg-card p-5 flex items-center gap-4 active:scale-[0.97] transition-all shadow-sm">
                <span className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Upload size={22} className="text-muted-foreground" />
                </span>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold">{t("importStatement")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("importStatementDesc")}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/30" />
              </Link>
            </div>
          )}
          {error && <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-xl p-3 w-full">{error}</p>}
        </div>
      )}

      {/* ── STEP 1: AMOUNT ── */}
      {step===1 && (
        <FullStep slideClass={slideClass} onBack={()=>back()} stepLabel={aiUsed?t("aiDetectedAmount"):t("movementAmount")}>
          {/* Direction toggle */}
          <div className="flex gap-2 bg-muted/40 p-1 rounded-2xl mb-6 mx-4">
            <button onClick={()=>setDirection("expense")}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${direction==="expense"?"bg-card text-red-400 shadow-sm":"text-muted-foreground"}`}>
              <ArrowDownCircle size={18} /> {t("expense")}
            </button>
            <button onClick={()=>setDirection("income")}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${direction==="income"?"bg-card text-[#2D6A4F] shadow-sm":"text-muted-foreground"}`}>
              <ArrowUpCircle size={18} /> {t("income")}
            </button>
          </div>

          <div className="flex items-center justify-center gap-1 py-8">
            <span className="text-5xl font-light text-muted-foreground/40">{sym}</span>
            <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}
              placeholder="0,00" autoFocus
              className="text-6xl font-extrabold text-center w-56 bg-transparent border-none outline-none tabular-nums placeholder:text-muted-foreground/15" />
          </div>

          <StepButton onClick={()=>{if(!parseFloat(amount)){setError(t("enterAmount"));return;}next();}} label={t("next")} />
          {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
        </FullStep>
      )}

      {/* ── STEP 2: NAME ── */}
      {step===2 && (
        <FullStep slideClass={slideClass} onBack={back} stepLabel={aiUsed?t("aiDetectedName"):t("movementName")}>
          <div className="py-8 px-2">
            <input type="text" value={description} onChange={e=>setDescription(e.target.value)}
              placeholder={t("descriptionExample")}
              autoFocus
              className="w-full text-2xl font-bold text-center bg-transparent border-none outline-none placeholder:text-muted-foreground/30" />
            <div className="h-0.5 bg-gradient-to-r from-transparent via-[#2D6A4F]/30 to-transparent mt-4 mx-8" />
          </div>
          <StepButton onClick={next} label={t("next")} />
        </FullStep>
      )}

      {/* ── TRANSFER CHECK (between step 2 and 3) ── */}
      {showTransferCheck && step===2 && (
        <div className={`${slideClass} space-y-5`}>
          <div className="flex items-center justify-between">
            <button onClick={()=>{setShowTransferCheck(false);}} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
              <ChevronRight size={16} className="rotate-180" /> {t("back")}
            </button>
          </div>

          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-[#2D6A4F]/10 flex items-center justify-center mx-auto mb-4">
              <ArrowLeftRight size={28} className="text-[#2D6A4F]" />
            </div>
            <p className="text-lg font-bold mb-1">{t("isInternalTransfer")}</p>
            <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
              {t("looksLikeTransfer")}
            </p>
          </div>

          {/* Yes — select accounts */}
          <button onClick={()=>{setIsTransfer(true);setShowTransferCheck(false);setCategory("transferencia");}}
            className="w-full rounded-2xl bg-[#2D6A4F] text-white p-5 text-left active:scale-[0.97] transition-all shadow-lg shadow-[#2D6A4F]/25">
            <p className="text-sm font-bold">{t("yesTransfer")}</p>
            <p className="text-xs text-white/60 mt-0.5">{t("selectOriginDest")}</p>
          </button>

          {/* No — continue as normal */}
          <button onClick={()=>{setIsTransfer(false);setShowTransferCheck(false);setSlideDir("right");setStep(3);}}
            className="w-full rounded-2xl border border-border bg-card p-5 text-left active:scale-[0.97] transition-all shadow-sm">
            <p className="text-sm font-bold">{t("noNormalExpense")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("continueNormal")}</p>
          </button>
        </div>
      )}

      {/* ── TRANSFER: SELECT ACCOUNTS ── */}
      {isTransfer && step===2 && !showTransferCheck && (
        <div className={`${slideClass} space-y-5`}>
          <div className="flex items-center justify-between">
            <button onClick={()=>{setIsTransfer(false);setShowTransferCheck(true);}} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
              <ChevronRight size={16} className="rotate-180" /> {t("back")}
            </button>
            <p className="text-xs text-muted-foreground font-medium">{t("transfer")}</p>
          </div>

          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground mb-2 text-center font-medium">{t("from").toUpperCase()}</p>
            <div className="flex flex-col gap-2">
              {accounts.map(acc => (
                <button key={acc.slug} onClick={()=>setTransferFrom(acc.slug)}
                  className={`w-full rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] ${
                    transferFrom===acc.slug ? "bg-red-400/15 ring-2 ring-red-400/30" : "bg-card border border-border"
                  }`}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor:`${acc.color}20`}}>
                    <span className="text-sm font-bold" style={{color:acc.color}}>{acc.name.charAt(0)}</span>
                  </span>
                  <span className="text-sm font-bold flex-1 text-left">{acc.name}</span>
                  {transferFrom===acc.slug && <Check size={16} className="text-red-400" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground mb-2 text-center font-medium">{t("to").toUpperCase()}</p>
            <div className="flex flex-col gap-2">
              {accounts.filter(a => a.slug !== transferFrom).map(acc => (
                <button key={acc.slug} onClick={()=>setTransferTo(acc.slug)}
                  className={`w-full rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] ${
                    transferTo===acc.slug ? "bg-[#2D6A4F]/15 ring-2 ring-[#2D6A4F]/30" : "bg-card border border-border"
                  }`}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor:`${acc.color}20`}}>
                    <span className="text-sm font-bold" style={{color:acc.color}}>{acc.name.charAt(0)}</span>
                  </span>
                  <span className="text-sm font-bold flex-1 text-left">{acc.name}</span>
                  {transferTo===acc.slug && <Check size={16} className="text-[#2D6A4F]" />}
                </button>
              ))}
            </div>
          </div>

          {(!transferFrom || !transferTo) && <p className="text-[10px] text-red-400/80 text-center">{t("selectBothAccounts")}</p>}

          <StepButton onClick={()=>{
            if(!transferFrom||!transferTo){setError(t("selectBothAccounts"));return;}
            setSlideDir("right");setStep(6);
          }} label={t("reviewTransfer")} disabled={!transferFrom||!transferTo} />
          {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
        </div>
      )}

      {/* ── STEP 3: ACCOUNT ── */}
      {step===3 && (
        <FullStep slideClass={slideClass} onBack={back} stepLabel={t("whichAccount")}>
          {account && aiUsed && (
            <div className="flex items-center gap-2 text-xs text-[#2D6A4F] bg-[#2D6A4F]/10 rounded-xl px-3 py-2 mb-3">
              <Sparkles size={12} /> {t("accountDetected")}
            </div>
          )}
          <div className="flex flex-col gap-3 py-4">
            {accounts.map(acc => (
              <button key={acc.slug} onClick={()=>selectAndAdvance(()=>setAccount(acc.slug))}
                className={`w-full rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.97] ${
                  account===acc.slug
                    ? "bg-[#2D6A4F] text-white shadow-lg shadow-[#2D6A4F]/30"
                    : "bg-card border border-border text-foreground shadow-sm"
                }`}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{backgroundColor:account===acc.slug?"rgba(255,255,255,0.2)":`${acc.color}20`}}>
                  <span className="text-lg font-bold" style={{color:account===acc.slug?"white":acc.color}}>
                    {acc.name.charAt(0)}
                  </span>
                </span>
                <span className="text-sm font-bold flex-1 text-left">{acc.name}</span>
                {account===acc.slug && <Check size={20} />}
              </button>
            ))}
          </div>
          {!account && <p className="text-xs text-red-400/80 text-center">{t("selectAccount")}</p>}
          <StepButton onClick={()=>{if(!account&&accounts.length>0){setError(t("selectAccount"));return;}next();}} label={t("next")} disabled={!account && accounts.length > 0} />
          {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
        </FullStep>
      )}

      {/* ── STEP 4: CATEGORY ── */}
      {step===4 && (() => {
        const suggested = suggestCategory(description);
        const suggestedSlug = suggested?.category;
        return (
        <FullStep slideClass={slideClass} onBack={back} stepLabel={t("whichCategory")}>
          {suggestedSlug && category === suggestedSlug && (
            <div className="flex items-center gap-2 text-xs text-[#2D6A4F] bg-[#2D6A4F]/10 rounded-xl px-3 py-2 mb-3">
              <Sparkles size={12} /> {t("categorySuggested")} &ldquo;{description}&rdquo;
            </div>
          )}
          <div className="flex flex-col gap-2 py-2">
            {catEntries.map(([slug, info]) => (
              <button key={slug} onClick={()=>selectAndAdvance(()=>{setCategory(slug);setCustomCategory("");})}
                className={`w-full rounded-2xl p-3.5 flex items-center gap-3 transition-all active:scale-[0.97] ${
                  category===slug
                    ? "bg-[#2D6A4F]/15 ring-2 ring-[#2D6A4F]/40 shadow-sm"
                    : "bg-card border border-border"
                }`}>
                <CategoryIcon icon={info.icon} color={category===slug?"#2D6A4F":info.color} size="md" />
                <span className={`text-sm font-semibold flex-1 text-left ${category===slug?"text-[#2D6A4F]":""}`}>{info.label}</span>
                {suggestedSlug === slug && category !== slug && (
                  <span className="text-[9px] text-[#2D6A4F] bg-[#2D6A4F]/10 px-2 py-0.5 rounded-full font-medium">{t("suggested")}</span>
                )}
                {category===slug && <Check size={16} className="text-[#2D6A4F]" />}
              </button>
            ))}
            {/* User's custom categories — usan el icon+color que el user
                eligio al crearlas (fallback al icono generico si vienen
                NULL de la BD legacy). */}
            {customCategories.filter(c => c.direction === direction).map(c => {
              const cIcon = c.icon || "CircleDot";
              const cColor = c.color || "#71717a";
              return (
                <button key={c.slug} onClick={()=>selectAndAdvance(()=>{setCategory(c.slug);setCustomCategory("");})}
                  className={`w-full rounded-2xl p-3.5 flex items-center gap-3 transition-all active:scale-[0.97] ${
                    category===c.slug ? "bg-[#2D6A4F]/15 ring-2 ring-[#2D6A4F]/40 shadow-sm" : "bg-card border border-border"
                  }`}>
                  <CategoryIcon icon={cIcon} color={category===c.slug?"#2D6A4F":cColor} size="md" />
                  <span className={`text-sm font-semibold flex-1 text-left ${category===c.slug?"text-[#2D6A4F]":""}`}>{c.label}</span>
                  {category===c.slug && <Check size={16} className="text-[#2D6A4F]" />}
                </button>
              );
            })}
            {/* Create new category */}
            <button onClick={()=>setCategory("_custom")}
              className={`w-full rounded-2xl p-3.5 flex items-center gap-3 transition-all active:scale-[0.97] ${
                category==="_custom" ? "bg-[#2D6A4F]/15 ring-2 ring-[#2D6A4F]/40" : "bg-card border border-border"
              }`}>
              <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Plus size={18} className="text-muted-foreground" />
              </span>
              <span className="text-sm font-semibold text-left flex-1">{t("createCategory")}</span>
            </button>
            {category==="_custom" && (
              <CategoryCreate
                name={customCategory}
                icon={customCategoryIcon}
                color={customCategoryColor}
                onName={setCustomCategory}
                onIcon={setCustomCategoryIcon}
                onColor={setCustomCategoryColor}
                placeholder={t("writeCategoryName")}
                pickIconLabel={t("pickAnIcon")}
                pickColorLabel={t("pickAColor")}
              />
            )}
          </div>
          <StepButton onClick={()=>{if(!category){setError(t("selectCategory"));return;}next();}} label={t("next")} disabled={!category} />
          {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
        </FullStep>
        );
      })()}

      {/* ── STEP 5: EXPENSE TYPE ── */}
      {step===5 && direction==="expense" && (
        <FullStep slideClass={slideClass} onBack={back} stepLabel={t("whichExpenseType")}>
          <div className="flex flex-col gap-3 py-6">
            {([
              ["necesario", t("necessary"), t("necessaryDesc")],
              ["negocio", t("business"), t("businessDesc")],
              ["discrecional", t("discretionary"), t("discretionaryDesc")],
            ] as const).map(([key, label, desc]) => (
              <button key={key} onClick={()=>selectAndAdvance(()=>setExpenseType(key))}
                className={`w-full rounded-2xl p-5 text-left transition-all active:scale-[0.97] ${
                  expenseType===key
                    ? "bg-[#2D6A4F] text-white shadow-lg shadow-[#2D6A4F]/30"
                    : "bg-card border border-border shadow-sm"
                }`}>
                <p className="text-sm font-bold">{label}</p>
                <p className={`text-xs mt-0.5 ${expenseType===key?"text-white/70":"text-muted-foreground"}`}>{desc}</p>
              </button>
            ))}
          </div>
          <StepButton onClick={()=>{if(!expenseType){setError(t("selectType"));return;}next();}} label={t("next")} disabled={!expenseType} />
          {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
        </FullStep>
      )}

      {/* ── STEP 6: SUMMARY ── */}
      {step===6 && (
        <FullStep
          slideClass={slideClass}
          onBack={back}
          stepLabel={isTransfer ? t("reviewTheTransfer") : t("reviewing")}
          footer={!duplicateWarning ? (
            <Button onClick={handleSave} disabled={saving}
              className="w-full h-14 rounded-2xl bg-gradient-to-b from-[#2D6A4F] to-[#245A42] hover:from-[#2D6A4F] hover:to-[#1F4D35] font-bold text-base shadow-sm active:scale-[0.97] transition-all ring-0 border-0">
              {saving ? <><Loader2 size={20} className="animate-spin mr-2" /> {t("saving")}</> : <><Check size={20} className="mr-2" /> {aiUsed ? t("confirmAndSave") : t("confirm")}</>}
            </Button>
          ) : undefined}
        >
          {/* Nota: el antiguo chip "Lo hemos rellenado por ti" y el toast
              "Lo hicimos por ti" (PremiumProvider.aiTouchSaved) se quitaron
              para no acumular feedback redundante en un mismo gesto. La
              celebracion + toast unico de "guardado" basta. */}
          <div className="rounded-3xl border border-border bg-card shadow-xl overflow-hidden mt-2 mb-2.5">
            {/* Hero amount — clickable para editar importe */}
            <button
              type="button"
              onClick={() => { setEditReturnToSummary(true); setSlideDir("left"); setStep(1); }}
              disabled={isTransfer}
              className={`w-full px-5 pt-4 pb-3 text-center ${!isTransfer ? "active:bg-muted/30 transition-colors" : ""}`}
            >
              {isTransfer && (
                <div className="w-10 h-10 rounded-2xl bg-[#2D6A4F]/10 flex items-center justify-center mx-auto mb-2">
                  <ArrowLeftRight size={20} className="text-[#2D6A4F]" />
                </div>
              )}
              <p className={`text-4xl font-extrabold tabular-nums leading-none ${isTransfer?"text-[#2D6A4F]":direction==="income"?"text-[#2D6A4F]":"text-foreground"}`}>
                {sym}{fmt2(parseFloat(amount||"0"))}
              </p>
              {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
            </button>

            <div className="px-5 pb-3">
              <div className="h-px bg-border" />
              {isTransfer ? (
                <>
                  <SummaryRow label={t("from")}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{backgroundColor:normalizeAccountColor(accounts.find(a=>a.slug===transferFrom)?.color)}} />
                      {accounts.find(a=>a.slug===transferFrom)?.name ?? transferFrom}
                    </span>
                  </SummaryRow>
                  <SummaryRow label={t("to")}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{backgroundColor:normalizeAccountColor(accounts.find(a=>a.slug===transferTo)?.color)}} />
                      {accounts.find(a=>a.slug===transferTo)?.name ?? transferTo}
                    </span>
                  </SummaryRow>
                  <SummaryRow label={t("type")}>{t("internalTransfer")}</SummaryRow>
                </>
              ) : (
                <>
                  {selectedAccount && (
                    <SummaryRow label={t("account")} onEdit={() => { setEditReturnToSummary(true); setSlideDir("left"); setStep(3); }}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{backgroundColor:normalizeAccountColor(selectedAccount.color)}} />
                        {selectedAccount.name}
                      </span>
                    </SummaryRow>
                  )}
                  {(selectedCatInfo || category==="_custom") && (
                    <SummaryRow label={t("category")} onEdit={() => { setEditReturnToSummary(true); setSlideDir("left"); setStep(4); }}>
                      {selectedCatInfo ? (
                        <span className="flex items-center gap-2">
                          <CategoryIcon icon={selectedCatInfo.icon} color={selectedCatInfo.color} size="sm" withBackground={false} />
                          {selectedCatInfo.label}
                        </span>
                      ) : customCategory}
                    </SummaryRow>
                  )}
                  {direction==="expense" && expenseType && (
                    <SummaryRow label={t("type")} onEdit={() => { setEditReturnToSummary(true); setSlideDir("left"); setStep(5); }}>
                      {expenseType==="necesario"?t("necessary"):expenseType==="negocio"?t("business"):t("discretionary")}
                    </SummaryRow>
                  )}
                </>
              )}
              {/* Fecha — editable via input nativo iOS/Android. El <input>
                  está encima de la fila con opacity 0 y al tocarla despliega
                  el date picker nativo. Formato compacto "22 abr 2026" para
                  que nunca haga line-wrap aunque la pantalla sea estrecha. */}
              <label className="relative w-full flex items-center justify-between py-3 border-t border-border/50 active:bg-muted/30 transition-colors rounded-lg -mx-2 px-2 cursor-pointer">
                <span className="text-xs text-muted-foreground">{t("date")}</span>
                <span className="text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap">
                  {new Date(date+"T00:00:00").toLocaleDateString(localeCode,{day:"numeric",month:"short",year:"numeric"}).replace(/\./g, "")}
                  <ChevronRightIcon />
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                  aria-label={t("date")}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Mark as recurring — creates a fixed expense / fixed income after save */}
          {!isTransfer && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden mb-2.5">
              <div className="flex items-center gap-3 px-3.5 pt-3 pb-2.5">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${markAsRecurring ? "bg-[#2D6A4F] text-white" : "bg-muted text-muted-foreground"}`}>
                  <Repeat size={14} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{t("recurringQuestion")}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{t("recurringQuestionDesc")}</p>
                </div>
              </div>
              <div className="px-3.5 pb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMarkAsRecurring(false)}
                  aria-pressed={!markAsRecurring}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all ${!markAsRecurring ? "bg-muted text-foreground shadow-sm" : "bg-transparent border border-border text-muted-foreground"}`}
                >
                  {t("no")}
                </button>
                <button
                  type="button"
                  onClick={() => setMarkAsRecurring(true)}
                  aria-pressed={markAsRecurring}
                  className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all ${markAsRecurring ? "bg-[#2D6A4F] text-white shadow-sm" : "bg-transparent border border-border text-muted-foreground"}`}
                >
                  {t("yes")}
                </button>
              </div>

              {markAsRecurring && (
                <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border pt-4">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("recurringFrequency")}</p>
                    <div className="flex gap-2">
                      {(["monthly","yearly","weekly"] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setRecurringCycle(c)}
                          aria-pressed={recurringCycle === c}
                          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${recurringCycle === c ? "bg-[#2D6A4F] text-white shadow-sm" : "bg-muted text-muted-foreground"}`}
                        >
                          {c === "monthly" ? t("monthly") : c === "yearly" ? t("annual") : t("weekly")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("recurringNextDate")}</p>
                    <input
                      type="date"
                      value={recurringNextDate}
                      onChange={e => setRecurringNextDate(e.target.value)}
                      className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>

                  {accounts.length > 1 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("recurringAccount")}</p>
                      <div className="flex flex-wrap gap-2">
                        {accounts.map(a => (
                          <button
                            key={a.slug}
                            type="button"
                            onClick={() => setRecurringAccount(a.slug)}
                            aria-pressed={recurringAccount === a.slug}
                            className={`flex items-center gap-2 px-3 h-10 rounded-xl text-xs font-semibold transition-all ${recurringAccount === a.slug ? "bg-[#2D6A4F] text-white shadow-sm" : "bg-muted text-muted-foreground"}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:normalizeAccountColor(a.color)}} />
                            {a.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-xl p-3">{error}</p>}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 space-y-2.5 animate-in">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500 shrink-0" />
                <p className="text-sm font-semibold">{t("possibleDuplicate")}</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{t("possibleDuplicateDesc")}</p>
              <div className="rounded-xl bg-card border border-border px-3 py-2 text-[11px]">
                <p className="font-medium truncate">{duplicateWarning.description}</p>
                <p className="text-muted-foreground tabular-nums">{sym}{fmt2(duplicateWarning.amount)} · {duplicateWarning.date}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-9 rounded-xl text-xs" onClick={() => { setDuplicateWarning(null); setDuplicateChecked(false); back(); }}>
                  {t("rejectDuplicate")}
                </Button>
                <Button size="sm" className="flex-1 h-9 rounded-xl text-xs bg-primary hover:bg-primary/90" onClick={() => { setDuplicateWarning(null); setDuplicateChecked(true); handleSave(); }}>
                  {t("confirmSave")}
                </Button>
              </div>
            </div>
          )}

        </FullStep>
      )}

      {/* ── STEP 7: DONE ── */}
      {step===7 && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background animate-[scaleIn_0.5s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
          style={{ touchAction: "none" }}
          onTouchMove={(e) => e.preventDefault()}
        >
          <Confetti active={showCelebration} />
          <div className="w-24 h-24 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-2xl shadow-[#2D6A4F]/40 animate-[scaleIn_0.5s_cubic-bezier(0.16,1,0.3,1)]">
            <Check size={44} className="text-white" strokeWidth={3} />
          </div>
          <div className="text-center px-6">
            <p className="text-2xl font-extrabold mb-1">
              {bankTotal > 1
                ? `${bankSaved} ${t("transactionOf")}`
                : direction === "income"
                ? t("incomeSavedCelebration")
                : t("savedCelebration")}
            </p>
            <p className="text-sm text-muted-foreground">
              {bankTotal > 1
                ? t("allTransactionsSaved")
                : `${direction==="income"?"+":"-"}${sym}${fmt2(parseFloat(amount))} ${t("inAccount")} ${selectedAccount?.name??t("account")}`
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable step wrapper ── */
function FullStep({ children, slideClass, onBack, stepLabel, footer }: {
  children: React.ReactNode;
  slideClass: string;
  onBack: () => void;
  stepLabel: string;
  /**
   * Footer opcional que queda pegado al bottom fuera del scroll (sticky).
   * Útil cuando el contenido crece — ej. step 6 al activar "es recurrente"
   * aparecen 3 campos extra — para que el CTA primario siempre quede visible
   * sin tapar el último campo del formulario.
   */
  footer?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={`${slideClass} pt-2 flex-1 min-h-0 flex flex-col`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 active:scale-95 transition-transform shrink-0">
        <ChevronRight size={16} className="rotate-180" /> {t("back")}
      </button>
      <p className="text-lg font-bold text-center mb-2 shrink-0">{stepLabel}</p>
      {/* Scrollable area — el contenido ocupa lo que haya disponible y
          scrollea si supera el viewport. El footer queda pegado abajo. */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-3">
        {children}
      </div>
      {footer && (
        <div className="shrink-0 pt-2 bg-background">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ── Step action button ── */
function StepButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled}
      className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-xl shadow-[#2D6A4F]/20 active:scale-[0.97] transition-all mt-4 disabled:opacity-40">
      {label} <ChevronRight size={18} className="ml-1" />
    </Button>
  );
}

/* ── Summary row ── */
function SummaryRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit?: () => void }) {
  const content = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold flex items-center gap-1.5">
        {children}
        {onEdit && <ChevronRightIcon />}
      </span>
    </>
  );
  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="w-full flex items-center justify-between py-3 border-t border-border/50 active:bg-muted/30 transition-colors rounded-lg -mx-2 px-2"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between py-3 border-t border-border/50">
      {content}
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ── Multi-transaction review screen ── */
interface MultiReviewItem {
  description: string;
  amount: number;
  currency: string;
  direction: "income" | "expense";
  date: string;
  category: string;
  expense_type: string | null;
  account?: string | null;
  selected?: boolean;
  duplicate?: boolean;
  duplicateOf?: { description: string; amount: number; date: string } | null;
}

function MultiReview({
  items,
  saving,
  progress,
  accounts,
  onCancel,
  onChange,
  onConfirm,
}: {
  items: MultiReviewItem[];
  saving: boolean;
  progress: { done: number; total: number };
  accounts: AccountOption[];
  onCancel: () => void;
  onChange: (next: MultiReviewItem[]) => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt2 = (n: number) =>
    n.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalSym = getCurrencySymbol(items[0]?.currency ?? "EUR");
  const selectedCount = items.filter((i) => i.selected).length;
  const duplicateCount = items.filter((i) => i.duplicate).length;
  const totalSelected = items
    .filter((i) => i.selected)
    .reduce((acc, it) => acc + (it.direction === "expense" ? it.amount : -it.amount), 0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  function toggle(idx: number): void {
    const next = items.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it));
    onChange(next);
  }

  function selectAll(): void {
    onChange(items.map((it) => ({ ...it, selected: true })));
  }

  function deselectAll(): void {
    onChange(items.map((it) => ({ ...it, selected: false })));
  }

  function deselectDuplicates(): void {
    onChange(items.map((it) => (it.duplicate ? { ...it, selected: false } : it)));
  }

  function applyEdit(idx: number, patch: Partial<MultiReviewItem>): void {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  }

  // Lock body scroll while the overlay is open and hide bottom tabs implicitly
  // thanks to z-[200] which sits above the app shell.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-background animate-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="multi-review-title"
    >
      {/* ── Header ── */}
      <header
        className="shrink-0 border-b border-border bg-background/95 backdrop-blur px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90 transition-colors disabled:opacity-50"
            aria-label={t("back")}
          >
            <X size={18} className="text-foreground" />
          </button>
          <span className="text-[10px] font-bold tracking-wide text-[#2D6A4F] bg-[#2D6A4F]/10 px-3 py-1 rounded-full">
            {items.length} {t("detectedTransactions")}
          </span>
          <div className="w-9" />
        </div>
        <div className="mt-3">
          <h2 id="multi-review-title" className="text-lg font-bold leading-tight">
            {t("multiReviewTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("multiReviewSubtitle")}</p>
        </div>
      </header>

      {/* ── Scrollable list ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pt-3 pb-6 space-y-3">
          {duplicateCount > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-medium text-amber-800 flex items-center gap-2 min-w-0">
                <AlertCircle size={13} className="shrink-0" />
                <span className="truncate">{duplicateCount} {t("possibleDuplicatesDetected")}</span>
              </p>
              <button
                onClick={deselectDuplicates}
                disabled={saving}
                className="text-[11px] font-semibold text-amber-900 hover:underline shrink-0 active:scale-95 transition-transform"
              >
                {t("multiDeselectDuplicates")}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">
              {selectedCount}/{items.length} {t("selectedPlural")}
            </span>
            <button
              onClick={selectedCount === items.length ? deselectAll : selectAll}
              disabled={saving}
              className="text-[#2D6A4F] font-semibold hover:underline active:scale-95 transition-transform"
            >
              {selectedCount === items.length ? t("deselectAll") : t("selectAll")}
            </button>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => {
              const sym = getCurrencySymbol(it.currency);
              const acc = accounts.find((a) => a.slug === it.account);
              const dateLabel = it.date
                ? new Date(it.date + "T00:00:00").toLocaleDateString(localeCode, { day: "numeric", month: "short" })
                : "—";
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition-all ${
                    it.selected
                      ? "border-[#2D6A4F]/40 bg-[#2D6A4F]/5 shadow-sm"
                      : "border-border bg-card opacity-70"
                  } ${it.duplicate ? "ring-1 ring-amber-400/40" : ""}`}
                >
                  <div className="flex items-stretch">
                    {/* Checkbox (toggle) — own click area */}
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      disabled={saving}
                      aria-label={it.selected ? t("deselect") : t("select")}
                      aria-pressed={!!it.selected}
                      className="shrink-0 self-stretch pl-4 pr-2 flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <span
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          it.selected ? "bg-[#2D6A4F] border-[#2D6A4F]" : "border-muted-foreground/30 bg-background"
                        }`}
                      >
                        {it.selected && <Check size={12} className="text-white" strokeWidth={3} />}
                      </span>
                    </button>

                    {/* Content area — tap to edit */}
                    <button
                      type="button"
                      onClick={() => setEditingIdx(idx)}
                      disabled={saving}
                      className="flex-1 min-w-0 py-4 pr-2 text-left active:opacity-70 transition-opacity"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold truncate">
                          {it.description || t("noDescription")}
                        </p>
                        <p
                          className={`text-sm font-bold tabular-nums shrink-0 ${
                            it.direction === "income" ? "text-[#2D6A4F]" : "text-foreground"
                          }`}
                        >
                          {it.direction === "income" ? "+" : "-"}{sym}{fmt2(it.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">{dateLabel}</span>
                        {it.category && (
                          <span className="text-[11px] text-muted-foreground">· {it.category}</span>
                        )}
                        {acc && <span className="text-[11px] text-muted-foreground">· {acc.name}</span>}
                        {it.duplicate && (
                          <span className="text-[10px] text-amber-800 bg-amber-500/15 px-2 py-0.5 rounded-full font-semibold">
                            {t("possibleDuplicate")}
                          </span>
                        )}
                      </div>
                      {it.duplicate && it.duplicateOf && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">
                          {t("similarTo")}: {it.duplicateOf.description} · {it.duplicateOf.date}
                        </p>
                      )}
                    </button>

                    {/* Edit (pencil) — own click area */}
                    <button
                      type="button"
                      onClick={() => setEditingIdx(idx)}
                      disabled={saving}
                      aria-label={t("editFields")}
                      className="shrink-0 self-stretch px-3 flex items-center justify-center text-muted-foreground hover:text-[#2D6A4F] active:scale-90 transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer
        className="shrink-0 border-t border-border bg-background/95 backdrop-blur px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
      >
        {saving ? (
          <div className="mb-2">
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2D6A4F] transition-all duration-300"
                style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-1.5">
              {progress.done}/{progress.total}
            </p>
          </div>
        ) : (
          selectedCount > 0 && (
            <div className="flex items-center justify-between mb-2 px-1 text-[11px]">
              <span className="text-muted-foreground">
                {t("netTotal")}
              </span>
              <span className={`tabular-nums font-semibold ${totalSelected >= 0 ? "text-foreground" : "text-[#2D6A4F]"}`}>
                {totalSelected >= 0 ? "-" : "+"}{totalSym}{fmt2(Math.abs(totalSelected))}
              </span>
            </div>
          )
        )}
        <Button
          onClick={onConfirm}
          disabled={saving || selectedCount === 0}
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-xl shadow-[#2D6A4F]/20 active:scale-[0.97] transition-all disabled:opacity-40"
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin mr-2" /> {t("saving")}</>
          ) : (
            <><Check size={18} className="mr-2" /> {t("registerSelected").replace("{n}", String(selectedCount))}</>
          )}
        </Button>
      </footer>

      {editingIdx !== null && items[editingIdx] && (
        <MultiEditSheet
          item={items[editingIdx]}
          accounts={accounts}
          onClose={() => setEditingIdx(null)}
          onSave={(patch) => {
            applyEdit(editingIdx, patch);
            setEditingIdx(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Edit sheet for a single multi-review item ── */
function MultiEditSheet({
  item,
  accounts,
  onClose,
  onSave,
}: {
  item: MultiReviewItem;
  accounts: AccountOption[];
  onClose: () => void;
  onSave: (patch: Partial<MultiReviewItem>) => void;
}) {
  const t = useT();
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState(String(item.amount));
  const [direction, setDirection] = useState<"income" | "expense">(item.direction);
  const [date, setDate] = useState(item.date);
  const [category, setCategory] = useState(item.category);
  const [expenseType, setExpenseType] = useState(item.expense_type ?? "");
  const [account, setAccount] = useState(item.account ?? "");

  const allCats = direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const catEntries = Object.entries(allCats).filter(
    ([slug]) => !["otros", "otros-ingreso", "transferencia"].includes(slug),
  );

  function handleSave(): void {
    const parsed = parseFloat(amount);
    if (!isFinite(parsed) || parsed <= 0) return;
    onSave({
      description: description.trim(),
      amount: parsed,
      direction,
      date,
      category: category || (direction === "income" ? "otros-ingreso" : "otros"),
      expense_type: direction === "expense" ? (expenseType || null) : null,
      account: account || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border border-border shadow-2xl animate-[slideInUp_0.3s_cubic-bezier(0.16,1,0.3,1)] max-h-[92dvh] flex flex-col"
      >
        {/* handle */}
        <div className="w-10 h-1 bg-muted rounded-full mx-auto my-3 sm:hidden" />

        <div className="flex items-center justify-between px-5 pb-3 border-b border-border">
          <p className="text-base font-bold">{t("editTransaction")}</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90"
            aria-label={t("close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
          {/* Direction */}
          <div className="flex gap-2 bg-muted/40 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setDirection("expense")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                direction === "expense" ? "bg-card text-red-500 shadow-sm" : "text-muted-foreground"
              }`}
            >
              <ArrowDownCircle size={14} /> {t("expense")}
            </button>
            <button
              type="button"
              onClick={() => setDirection("income")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                direction === "income" ? "bg-card text-[#2D6A4F] shadow-sm" : "text-muted-foreground"
              }`}
            >
              <ArrowUpCircle size={14} /> {t("income")}
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("amount")}</label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#2D6A4F]/30">
              <span className="text-sm text-muted-foreground">{getCurrencySymbol(item.currency)}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-lg font-bold outline-none tabular-nums"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("description")}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionExample")}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D6A4F]/30"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D6A4F]/30"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("category")}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {catEntries.map(([slug, info]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setCategory(slug)}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border text-left transition-all active:scale-95 ${
                    category === slug
                      ? "border-[#2D6A4F]/40 bg-[#2D6A4F]/10"
                      : "border-border bg-card"
                  }`}
                >
                  <CategoryIcon icon={info.icon} color={category === slug ? "#2D6A4F" : info.color} size="sm" withBackground={false} />
                  <span className={`text-[11px] font-semibold truncate ${category === slug ? "text-[#2D6A4F]" : ""}`}>
                    {info.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Expense type (only for expenses) */}
          {direction === "expense" && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("whichExpenseType")}</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["necesario", t("necessary")],
                  ["negocio", t("business")],
                  ["discrecional", t("discretionary")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setExpenseType(value as string)}
                    className={`py-2 rounded-xl border text-[11px] font-semibold transition-all active:scale-95 ${
                      expenseType === value
                        ? "border-[#2D6A4F]/40 bg-[#2D6A4F]/10 text-[#2D6A4F]"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("account")}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {accounts.map((acc) => (
                  <button
                    key={acc.slug}
                    type="button"
                    onClick={() => setAccount(acc.slug)}
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border text-left transition-all active:scale-95 ${
                      account === acc.slug
                        ? "border-[#2D6A4F]/40 bg-[#2D6A4F]/10"
                        : "border-border bg-card"
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ backgroundColor: `${acc.color}25`, color: acc.color }}
                    >
                      {acc.name.charAt(0)}
                    </span>
                    <span className="text-[11px] font-semibold truncate">{acc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="shrink-0 border-t border-border px-5 pt-3 flex gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl"
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!parseFloat(amount) || parseFloat(amount) <= 0}
            className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 font-bold"
          >
            <Check size={16} className="mr-1.5" /> {t("saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
