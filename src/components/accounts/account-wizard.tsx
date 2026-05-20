"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useT, useLocaleCode } from "@/lib/i18n";
import {
  X, ChevronLeft, ChevronRight, Check, Search, Upload, Building2, Wallet, Loader2,
  Percent, FileText, Pencil, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRIES, EFECTIVO_BANK, type BankInfo } from "@/data/banks-by-country";
import { BankLogo, BANK_LOGOS } from "@/components/bank-logos";
import { ImportProgressOverlay, type ImportPhase } from "@/components/import-progress-overlay";

type Step = "currency" | "bank" | "label" | "funding" | "interest" | "summary" | "done";

type InterestPaymentFrequency = "daily" | "monthly" | "quarterly" | "annual";

interface Currency {
  code: string;
  symbol: string;
  name: string;
  flagCode?: string; // ISO country for the flag
}

const CURRENCIES: Currency[] = [
  { code: "EUR", symbol: "€", name: "Euro", flagCode: "ES" },
  { code: "USD", symbol: "$", name: "US Dollar", flagCode: "US" },
  { code: "GBP", symbol: "£", name: "British Pound", flagCode: "GB" },
  { code: "MXN", symbol: "$", name: "Peso mexicano", flagCode: "MX" },
  { code: "ARS", symbol: "$", name: "Peso argentino", flagCode: "AR" },
  { code: "COP", symbol: "$", name: "Peso colombiano", flagCode: "CO" },
  { code: "CLP", symbol: "$", name: "Peso chileno", flagCode: "CL" },
  { code: "PEN", symbol: "S/.", name: "Sol peruano", flagCode: "PE" },
  { code: "UYU", symbol: "$", name: "Peso uruguayo", flagCode: "UY" },
];

// Deduplicated list of all banks across countries — for bank picker.
function getAllBanks(currency: string): BankInfo[] {
  const seen = new Map<string, BankInfo>();
  // Always include Efectivo (cash)
  seen.set("efectivo", EFECTIVO_BANK);
  for (const country of COUNTRIES) {
    if (country.currency !== currency) continue;
    for (const bank of country.banks) {
      if (!seen.has(bank.slug)) seen.set(bank.slug, bank);
    }
  }
  // Fallback: if currency not in our list, show global banks (EUR first, then USD)
  if (seen.size === 1) {
    for (const country of COUNTRIES) {
      if (country.currency === "EUR") {
        for (const bank of country.banks) if (!seen.has(bank.slug)) seen.set(bank.slug, bank);
      }
    }
  }
  return Array.from(seen.values());
}

type LabelPresetId =
  | "personal"
  | "business"
  | "other-person"
  | "shared"
  | "savings"
  | "custom";

interface LabelPreset {
  id: LabelPresetId;
  label: string;
  scope: "personal" | "business";
  /** True if the preset needs an inline name input. */
  needsName?: boolean;
  /** Placeholder for the inline name input. */
  namePlaceholder?: string;
}

export function AccountWizard({ userName, onCancel }: { userName?: string | null; onCancel?: () => void }) {
  const t = useT();
  const router = useRouter();
  const localeCode = useLocaleCode();

  const [step, setStep] = useState<Step>("currency");
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [error, setError] = useState("");

  // data
  const [currency, setCurrency] = useState("");
  const [selectedBank, setSelectedBank] = useState<BankInfo | null>(null);
  const [customBankName, setCustomBankName] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);

  const [scope, setScope] = useState<"personal" | "business">("personal");
  const [scopeLabel, setScopeLabel] = useState("");

  const [fundingMode, setFundingMode] = useState<"balance" | "import" | "">("");
  const [balance, setBalance] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase | undefined>(undefined);
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRemunerated, setIsRemunerated] = useState(false);
  const [interestRate, setInterestRate] = useState("");
  const [interestFreq, setInterestFreq] = useState<InterestPaymentFrequency>("monthly");

  const [creating, setCreating] = useState(false);

  const currencyInfo = CURRENCIES.find((c) => c.code === currency);
  const symbol = currencyInfo?.symbol ?? "$";

  const LABEL_PRESETS: LabelPreset[] = useMemo(() => {
    return [
      { id: "personal", label: t("labelPersonal"), scope: "personal" },
      { id: "business", label: t("labelBusiness"), scope: "business" },
      { id: "other-person", label: t("labelOtherPerson"), scope: "personal", needsName: true, namePlaceholder: t("labelOtherPersonPlaceholder") },
      { id: "shared", label: t("labelShared"), scope: "personal", needsName: true, namePlaceholder: t("labelSharedPlaceholder") },
      { id: "savings", label: t("labelSavings"), scope: "personal" },
      { id: "custom", label: t("labelCustom"), scope: "personal" },
    ];
  }, [t]);

  const banks = useMemo(() => {
    const all = getAllBanks(currency);
    const q = bankSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((b) => b.name.toLowerCase().includes(q) || b.slug.includes(q));
  }, [currency, bankSearch]);

  // --- navigation helpers ---
  function goNext(next: Step) {
    setError("");
    setDir("forward");
    setStep(next);
  }
  function goBack(prev: Step) {
    setError("");
    setDir("back");
    setStep(prev);
  }

  function slideClass(): string {
    return dir === "forward"
      ? "animate-[slideInRight_0.3s_ease-out]"
      : "animate-[slideInLeft_0.3s_ease-out]";
  }

  // --- bank picking ---
  function pickBank(bank: BankInfo) {
    setSelectedBank(bank);
    setCustomMode(false);
    setCustomBankName("");
  }
  function confirmCustomBank() {
    const name = customBankName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const bank: BankInfo = {
      slug: slug || `custom-${Date.now()}`,
      name,
      color: "#6b7280",
    };
    pickBank(bank);
    goNext("label");
  }

  // --- label: set the final label + scope from the step component ---
  function onLabelConfirm(finalLabel: string, finalScope: "personal" | "business") {
    setScopeLabel(finalLabel);
    setScope(finalScope);
    goNext("funding");
  }

  // --- funding: import file ---
  async function fileToPayload(file: File): Promise<{ csvText?: string; pdfBase64?: string; excelBase64?: string }> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext === "csv" || file.type.includes("csv")) {
      return { csvText: await file.text() };
    }
    if (ext === "pdf" || file.type.includes("pdf")) {
      const buf = await file.arrayBuffer();
      return { pdfBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
    }
    const buf = await file.arrayBuffer();
    return { excelBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
  }

  async function handleFile(file: File) {
    if (!selectedBank) return;
    setFileName(file.name);
    setImporting(true);
    setImportPhase("reading");
    setImportStartedAt(Date.now());
    try {
      const payload = await fileToPayload(file);

      // Ensure account exists before import
      setImportPhase("uploading");
      const ensureRes = await apiFetch("/api/onboarding/ensure-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedBank.slug,
          name: selectedBank.name,
          color: selectedBank.color,
          currency,
          initialBalance: 0,
        }),
      });
      if (!ensureRes.ok) {
        throw new Error("ensure-account failed");
      }

      // Preview (triggers AI categorization)
      setImportPhase("analyzing");
      const previewRes = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: "preview", targetAccount: selectedBank.slug }),
      });
      const previewData = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) throw new Error(previewData?.error ?? "analyze failed");

      // Commit
      setImportPhase("saving");
      const importRes = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: "import", targetAccount: selectedBank.slug }),
      });
      const importData = await importRes.json().catch(() => ({}));
      if (!importRes.ok) throw new Error(importData?.error ?? "import failed");

      const imported = importData.imported ?? previewData?.summary?.new ?? 0;
      setImportedCount(imported);
      setImportPhase("done");
      setFundingMode("import");
    } catch (e) {
      setImportPhase(undefined);
      setError(e instanceof Error ? e.message : "Error");
      setFundingMode("");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // --- final create account ---
  async function handleCreate() {
    if (!selectedBank || !currency) return;
    setCreating(true);
    setError("");
    try {
      const parsedBalance = balance
        ? parseFloat(balance.replace(/[^\d,.-]/g, "").replace(",", "."))
        : 0;
      const finalBalance = isFinite(parsedBalance) ? parsedBalance : 0;

      const parsedRate = parseFloat(interestRate.replace(",", "."));
      const annualRate = isRemunerated && isFinite(parsedRate) && parsedRate > 0
        ? parsedRate / 100
        : 0;

      // If imported, account already exists via ensure-account.
      // We still call POST — duplicates return 409, handled gracefully with PATCH instead.
      const res = await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedBank.slug,
          name: selectedBank.name,
          emoji: "",
          initial_balance: fundingMode === "balance" ? finalBalance : 0,
          currency,
          color: selectedBank.color,
          annual_interest_rate: annualRate,
          interest_payment_frequency: interestFreq,
          scope,
          scope_label: scopeLabel || null,
        }),
      });

      if (res.status === 409) {
        // Account already exists (import flow) — patch it with the extra fields.
        const listRes = await apiFetch("/api/accounts");
        const listData = await listRes.json();
        const existing = listData.accounts?.find(
          (a: { slug: string; id: number }) => a.slug === selectedBank.slug,
        );
        if (existing) {
          await apiFetch(`/api/accounts/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: selectedBank.name,
              emoji: "",
              initial_balance: fundingMode === "balance" ? finalBalance : existing.initial_balance ?? 0,
              color: selectedBank.color,
              annual_interest_rate: annualRate,
              interest_payment_frequency: interestFreq,
              scope,
              scope_label: scopeLabel || null,
            }),
          });
        }
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? t("accountCreationError"));
      }

      goNext("done");
      setTimeout(() => {
        router.push("/accounts");
        router.refresh();
      }, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setCreating(false);
    }
  }

  // --- render ---
  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {/* Header */}
      <header
        className="shrink-0 flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          onClick={() => (onCancel ? onCancel() : router.push("/accounts"))}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90 transition-all"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>
        <WizardProgress step={step} />
        <div className="w-9" />
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-40">
        {step === "currency" && (
          <StepCurrency
            className={slideClass()}
            value={currency}
            onPick={(c) => {
              setCurrency(c);
              goNext("bank");
            }}
          />
        )}

        {step === "bank" && (
          <StepBank
            className={slideClass()}
            banks={banks}
            search={bankSearch}
            setSearch={setBankSearch}
            selected={selectedBank}
            onPick={(b) => {
              pickBank(b);
              goNext("label");
            }}
            customMode={customMode}
            setCustomMode={setCustomMode}
            customBankName={customBankName}
            setCustomBankName={setCustomBankName}
            confirmCustom={confirmCustomBank}
            onBack={() => goBack("currency")}
          />
        )}

        {step === "label" && (
          <StepLabel
            className={slideClass()}
            presets={LABEL_PRESETS}
            userName={userName}
            initialLabel={scopeLabel}
            initialScope={scope}
            onConfirm={onLabelConfirm}
            onBack={() => goBack("bank")}
          />
        )}

        {step === "funding" && (
          <StepFunding
            className={slideClass()}
            symbol={symbol}
            bankName={selectedBank?.name ?? ""}
            mode={fundingMode}
            setMode={setFundingMode}
            balance={balance}
            setBalance={setBalance}
            fileInputRef={fileInputRef}
            handleFile={handleFile}
            importing={importing}
            importStartedAt={importStartedAt ?? undefined}
            importPhase={importPhase}
            importedCount={importedCount}
            fileName={fileName}
            onNext={() => goNext("interest")}
            onBack={() => goBack("label")}
            error={error}
            t={t}
          />
        )}

        {step === "interest" && (
          <StepInterest
            className={slideClass()}
            isRemunerated={isRemunerated}
            setIsRemunerated={setIsRemunerated}
            rate={interestRate}
            setRate={setInterestRate}
            freq={interestFreq}
            setFreq={setInterestFreq}
            onNext={() => goNext("summary")}
            onBack={() => goBack("funding")}
            t={t}
          />
        )}

        {step === "summary" && (
          <StepSummary
            className={slideClass()}
            bank={selectedBank}
            currency={currency}
            symbol={symbol}
            scopeLabel={scopeLabel}
            fundingMode={fundingMode}
            balance={balance}
            importedCount={importedCount}
            isRemunerated={isRemunerated}
            interestRate={interestRate}
            interestFreq={interestFreq}
            onConfirm={handleCreate}
            onEdit={(target) => goBack(target)}
            saving={creating}
            error={error}
            localeCode={localeCode}
            t={t}
          />
        )}

        {step === "done" && (
          <StepDone className={slideClass()} bankName={selectedBank?.name ?? ""} t={t} />
        )}
      </main>
    </div>
  );
}

/* ── Progress dots ── */
function WizardProgress({ step }: { step: Step }) {
  const ORDER: Step[] = ["currency", "bank", "label", "funding", "interest", "summary"];
  const idx = Math.min(ORDER.indexOf(step), ORDER.length - 1);
  return (
    <div className="flex items-center gap-1.5">
      {ORDER.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            s === step ? "w-5 bg-primary" : i < idx ? "w-1.5 bg-primary" : "w-1.5 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

/* ── Step 1: Currency ── */
function StepCurrency({ className, value, onPick }: { className: string; value: string; onPick: (c: string) => void }) {
  const t = useT();
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardCurrencyTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardCurrencySubtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            onClick={() => onPick(c.code)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.99] ${
              value === c.code ? "border-primary bg-accent" : "border-border bg-card hover:border-muted-foreground/30"
            }`}
          >
            <span className="text-2xl font-light w-8 text-center text-muted-foreground">{c.symbol}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{c.code}</p>
              <p className="text-[11px] text-muted-foreground truncate">{c.name}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground/40" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Step 2: Bank ── */
function StepBank({
  className, banks, search, setSearch, selected, onPick, customMode, setCustomMode,
  customBankName, setCustomBankName, confirmCustom, onBack,
}: {
  className: string;
  banks: BankInfo[];
  search: string;
  setSearch: (v: string) => void;
  selected: BankInfo | null;
  onPick: (b: BankInfo) => void;
  customMode: boolean;
  setCustomMode: (v: boolean) => void;
  customBankName: string;
  setCustomBankName: (v: string) => void;
  confirmCustom: () => void;
  onBack: () => void;
}) {
  const t = useT();
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardBankTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardBankSubtitle")}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("wizardBankSearchPlaceholder")}
          className="pl-10 h-11 rounded-xl"
        />
      </div>

      {/* Bank grid */}
      <div className="grid grid-cols-2 gap-2">
        {banks.map((bank) => (
          <button
            key={bank.slug}
            onClick={() => onPick(bank)}
            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors active:scale-[0.98] ${
              selected?.slug === bank.slug ? "border-primary bg-accent" : "border-border bg-card"
            }`}
          >
            {BANK_LOGOS[bank.slug] ? (
              <BankLogo bank={bank.slug} size={36} className="shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-white"
                style={{ backgroundColor: bank.color }}
              >
                {bank.name[0]}
              </div>
            )}
            <span className="text-[13px] font-medium truncate flex-1 min-w-0">{bank.name}</span>
          </button>
        ))}
      </div>

      {/* Custom bank */}
      {!customMode ? (
        <button
          onClick={() => setCustomMode(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-dashed border-border bg-card active:scale-[0.99] transition-all"
        >
          <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <Building2 size={16} className="text-muted-foreground" />
          </span>
          <div className="text-left">
            <p className="text-sm font-semibold">{t("wizardBankNotFound")}</p>
            <p className="text-[11px] text-muted-foreground">{t("wizardBankNotFoundDesc")}</p>
          </div>
        </button>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-accent p-4 space-y-2">
          <p className="text-sm font-semibold">{t("wizardBankCustomTitle")}</p>
          <Input
            value={customBankName}
            onChange={(e) => setCustomBankName(e.target.value)}
            placeholder={t("wizardBankCustomPlaceholder")}
            autoFocus
            className="h-11 rounded-xl bg-background"
            onKeyDown={(e) => e.key === "Enter" && confirmCustom()}
          />
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setCustomMode(false)}>
              {t("cancel")}
            </Button>
            <Button size="sm" className="flex-[2] rounded-xl bg-primary hover:bg-primary/90" disabled={!customBankName.trim()} onClick={confirmCustom}>
              {t("wizardBankAdd")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Step 3: Label ── */
function StepLabel({
  className, presets, userName, initialLabel, initialScope, onConfirm, onBack,
}: {
  className: string;
  presets: LabelPreset[];
  userName?: string | null;
  initialLabel: string;
  initialScope: "personal" | "business";
  onConfirm: (label: string, scope: "personal" | "business") => void;
  onBack: () => void;
}) {
  const t = useT();
  const firstName = userName?.split(" ")[0] ?? "";

  // Try to re-hydrate the previously picked preset from initialLabel.
  const initialPresetId = useMemo<LabelPresetId | null>(() => {
    if (!initialLabel) return null;
    if (initialLabel === t("labelPersonal")) return "personal";
    if (initialLabel === t("labelBusiness")) return "business";
    if (initialLabel === t("labelSavings")) return "savings";
    if (initialLabel.startsWith(t("labelSharedPrefix"))) return "shared";
    if (initialLabel.startsWith(t("labelOf"))) return "other-person";
    return "custom";
  }, [initialLabel, t]);

  const [presetId, setPresetId] = useState<LabelPresetId | null>(initialPresetId);

  // Separate inline inputs per preset — so switching between "Other person"
  // and "Shared" doesn't lose what the user typed.
  const [otherPersonName, setOtherPersonName] = useState(
    initialPresetId === "other-person" ? initialLabel.replace(`${t("labelOf")} `, "") : "",
  );
  const [sharedWithName, setSharedWithName] = useState(
    initialPresetId === "shared" ? initialLabel.replace(t("labelSharedPrefix"), "") : "",
  );
  const [customLabel, setCustomLabel] = useState(
    initialPresetId === "custom" ? initialLabel : "",
  );

  function computeLabel(): string | null {
    if (!presetId) return null;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return null;
    switch (presetId) {
      case "personal":
        return firstName ? `${t("labelOf")} ${firstName}` : t("labelPersonal");
      case "business":
        return t("labelBusiness");
      case "savings":
        return t("labelSavings");
      case "other-person":
        return otherPersonName.trim() ? `${t("labelOf")} ${otherPersonName.trim()}` : null;
      case "shared":
        return sharedWithName.trim() ? `${t("labelSharedPrefix")}${sharedWithName.trim()}` : null;
      case "custom":
        return customLabel.trim() || null;
      default:
        return preset.label;
    }
  }

  function handleNext() {
    const label = computeLabel();
    if (!label) return;
    const scope = presets.find((p) => p.id === presetId)?.scope ?? initialScope;
    onConfirm(label, scope);
  }

  const nextDisabled = !computeLabel();

  return (
    <div className={`${className} pt-4 space-y-5`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardLabelTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardLabelSubtitle")}</p>
      </div>

      <div className="space-y-2">
        {presets.map((preset) => {
          const active = preset.id === presetId;
          // Dynamic label for "personal" when we have the user name
          const displayLabel = preset.id === "personal" && firstName
            ? `${t("labelOf")} ${firstName}`
            : preset.label;

          return (
            <div key={preset.id}>
              <button
                type="button"
                onClick={() => setPresetId(preset.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                  active ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <span className="flex-1 text-sm font-semibold">{displayLabel}</span>
                {active && <Check size={18} className="text-primary" />}
              </button>

              {/* Inline input for presets that need a name */}
              {active && preset.id === "other-person" && (
                <div className="mt-2 ml-2 pl-2 border-l-2 border-primary/30 space-y-1">
                  <Input
                    autoFocus
                    value={otherPersonName}
                    onChange={(e) => setOtherPersonName(e.target.value.slice(0, 40))}
                    placeholder={preset.namePlaceholder}
                    className="h-11 rounded-xl"
                  />
                  {otherPersonName.trim() && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {t("wizardLabelPreview")}: <span className="font-semibold text-foreground">{t("labelOf")} {otherPersonName.trim()}</span>
                    </p>
                  )}
                </div>
              )}
              {active && preset.id === "shared" && (
                <div className="mt-2 ml-2 pl-2 border-l-2 border-primary/30 space-y-1">
                  <Input
                    autoFocus
                    value={sharedWithName}
                    onChange={(e) => setSharedWithName(e.target.value.slice(0, 40))}
                    placeholder={preset.namePlaceholder}
                    className="h-11 rounded-xl"
                  />
                  {sharedWithName.trim() && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {t("wizardLabelPreview")}: <span className="font-semibold text-foreground">{t("labelSharedPrefix")}{sharedWithName.trim()}</span>
                    </p>
                  )}
                </div>
              )}
              {active && preset.id === "custom" && (
                <div className="mt-2 ml-2 pl-2 border-l-2 border-primary/30 space-y-1">
                  <Input
                    autoFocus
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value.slice(0, 50))}
                    placeholder={t("wizardLabelCustomPlaceholder")}
                    className="h-11 rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground px-1">{customLabel.length}/50</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold"
          onClick={handleNext}
          disabled={nextDisabled}
        >
          {t("next")} <ChevronRight size={16} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 4: Funding (balance or import) ── */
function StepFunding({
  className, symbol, bankName, mode, setMode, balance, setBalance,
  fileInputRef, handleFile, importing, importStartedAt, importPhase,
  importedCount, fileName, onNext, onBack, error, t,
}: {
  className: string;
  symbol: string;
  bankName: string;
  mode: "balance" | "import" | "";
  setMode: (m: "balance" | "import" | "") => void;
  balance: string;
  setBalance: (v: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFile: (file: File) => Promise<void>;
  importing: boolean;
  importStartedAt: number | undefined;
  importPhase: ImportPhase | undefined;
  importedCount: number;
  fileName: string;
  onNext: () => void;
  onBack: () => void;
  error: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}) {
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardFundingTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardFundingSubtitle")}</p>
      </div>

      {/* Mode cards */}
      <div className="space-y-2">
        <button
          onClick={() => {
            setMode("import");
            fileInputRef.current?.click();
          }}
          disabled={importing || mode === "import"}
          className={`w-full rounded-2xl border p-4 flex items-center gap-3 text-left transition-all active:scale-[0.99] ${
            mode === "import" ? "border-primary bg-accent" : "border-border bg-card"
          }`}
        >
          <span className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold flex items-center gap-2">
              {t("wizardFundingImport")}
              <span className="text-[9px] font-bold tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                {t("recommended").toUpperCase()}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">{t("wizardFundingImportDesc")}</p>
          </div>
          <Upload size={16} className="text-muted-foreground/40" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.pdf,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <button
          onClick={() => {
            if (!importing) setMode("balance");
          }}
          disabled={importing}
          className={`w-full rounded-2xl border p-4 flex items-center gap-3 text-left transition-all active:scale-[0.99] ${
            mode === "balance" ? "border-primary bg-accent" : "border-border bg-card"
          }`}
        >
          <span className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Pencil size={20} className="text-muted-foreground" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{t("wizardFundingBalance")}</p>
            <p className="text-[11px] text-muted-foreground">{t("wizardFundingBalanceDesc")}</p>
          </div>
        </button>
      </div>

      {/* Import progress */}
      {importing && importStartedAt && (
        <ImportProgressOverlay
          open
          mode="preview"
          startedAt={importStartedAt}
          phase={importPhase}
          contextLabel={t("wizardImportingHeader").replace("{bank}", bankName)}
          fileName={fileName}
        />
      )}

      {/* Import done */}
      {!importing && mode === "import" && importedCount > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-accent p-4 flex items-start gap-3 animate-in fade-in zoom-in duration-300">
          <span className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Check size={18} className="text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{t("wizardImportDone")}</p>
            <p className="text-[11px] text-muted-foreground">
              {importedCount} {t("transactionsImported")}
            </p>
          </div>
        </div>
      )}

      {/* Balance input */}
      {mode === "balance" && !importing && (
        <div className="flex items-baseline justify-center gap-1 py-4">
          <span className="text-3xl font-light text-muted-foreground/50">{symbol}</span>
          <input
            type="text"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0"
            autoFocus
            className="text-5xl font-extrabold text-center w-56 bg-transparent border-none outline-none tabular-nums placeholder:text-muted-foreground/20"
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive text-center bg-destructive/5 rounded-xl p-3">{error}</p>}

      <div className="pt-2">
        <Button
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold"
          onClick={onNext}
          disabled={!mode || importing || (mode === "balance" && !balance)}
        >
          {t("next")} <ChevronRight size={16} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 5: Interest ── */
function StepInterest({
  className, isRemunerated, setIsRemunerated, rate, setRate, freq, setFreq, onNext, onBack, t,
}: {
  className: string;
  isRemunerated: boolean;
  setIsRemunerated: (v: boolean) => void;
  rate: string;
  setRate: (v: string) => void;
  freq: InterestPaymentFrequency;
  setFreq: (f: InterestPaymentFrequency) => void;
  onNext: () => void;
  onBack: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}) {
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardInterestTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardInterestSubtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setIsRemunerated(false)}
          className={`p-4 rounded-2xl border text-center transition-all active:scale-[0.99] ${
            !isRemunerated ? "border-primary bg-accent" : "border-border bg-card"
          }`}
        >
          <Wallet size={20} className={`mx-auto mb-1.5 ${!isRemunerated ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-sm font-bold">{t("no")}</p>
        </button>
        <button
          onClick={() => setIsRemunerated(true)}
          className={`p-4 rounded-2xl border text-center transition-all active:scale-[0.99] ${
            isRemunerated ? "border-primary bg-accent" : "border-border bg-card"
          }`}
        >
          <Percent size={20} className={`mx-auto mb-1.5 ${isRemunerated ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-sm font-bold">{t("yes")}</p>
        </button>
      </div>

      {isRemunerated && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("annualRate")}</label>
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="2.5"
                className="h-12 rounded-xl pr-10 text-lg font-semibold"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">{t("paymentFrequency")}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["daily", "monthly", "quarterly", "annual"] as InterestPaymentFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`py-2.5 rounded-xl border text-[11px] font-semibold transition-all active:scale-95 ${
                    freq === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {t(f)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold"
          onClick={onNext}
          disabled={isRemunerated && !rate}
        >
          {t("next")} <ChevronRight size={16} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 6: Summary ── */
function StepSummary({
  className, bank, currency, symbol, scopeLabel, fundingMode, balance, importedCount,
  isRemunerated, interestRate, interestFreq, onConfirm, onEdit, saving, error, localeCode, t,
}: {
  className: string;
  bank: BankInfo | null;
  currency: string;
  symbol: string;
  scopeLabel: string;
  fundingMode: "balance" | "import" | "";
  balance: string;
  importedCount: number;
  isRemunerated: boolean;
  interestRate: string;
  interestFreq: InterestPaymentFrequency;
  onConfirm: () => void;
  onEdit: (step: Step) => void;
  saving: boolean;
  error: string;
  localeCode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}) {
  const parsedBalance = balance ? parseFloat(balance.replace(",", ".")) : 0;
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("wizardSummaryTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wizardSummarySubtitle")}</p>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 pt-6 pb-5 text-center">
          {bank && BANK_LOGOS[bank.slug] ? (
            <BankLogo bank={bank.slug} size={52} className="mx-auto mb-2" />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-2 flex items-center justify-center text-xl font-bold text-white"
              style={{ backgroundColor: bank?.color ?? "#3b82f6" }}
            >
              {bank?.name[0] ?? "?"}
            </div>
          )}
          <p className="text-lg font-bold">{bank?.name ?? "—"}</p>
          {scopeLabel && <p className="text-xs text-muted-foreground mt-0.5">{scopeLabel}</p>}
        </div>

        <div className="px-5 pb-5 space-y-0">
          <SummaryRow
            label={t("wizardSummaryCurrency")}
            value={currency}
            onEdit={() => onEdit("currency")}
          />
          <SummaryRow
            label={t("wizardSummaryLabel")}
            value={scopeLabel || "—"}
            onEdit={() => onEdit("label")}
          />
          <SummaryRow
            label={t("wizardSummaryFunding")}
            value={
              fundingMode === "import"
                ? `${importedCount} ${t("transactionsImported")}`
                : fundingMode === "balance"
                  ? `${symbol}${isFinite(parsedBalance) ? parsedBalance.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0"}`
                  : "—"
            }
            onEdit={() => onEdit("funding")}
          />
          <SummaryRow
            label={t("wizardSummaryInterest")}
            value={
              isRemunerated
                ? `${interestRate}% ${t(interestFreq)}`
                : t("no")
            }
            onEdit={() => onEdit("interest")}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive text-center bg-destructive/5 rounded-xl p-3">{error}</p>}

      <Button
        onClick={onConfirm}
        disabled={saving}
        className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-xl shadow-[#2D6A4F]/20 active:scale-[0.97] transition-all"
      >
        {saving ? (
          <><Loader2 size={18} className="animate-spin mr-2" /> {t("saving")}</>
        ) : (
          <><Check size={18} className="mr-2" /> {t("wizardConfirmCreate")}</>
        )}
      </Button>
    </div>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-t border-border/50">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
      <button
        onClick={onEdit}
        className="ml-3 text-xs font-semibold text-primary hover:underline active:scale-95 transition-transform shrink-0"
      >
        <Pencil size={14} className="inline mr-1" />
      </button>
    </div>
  );
}

/* ── Step 7: Done ── */
function StepDone({ className, bankName, t }: {
  className: string;
  bankName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}) {
  return (
    <div className={`${className} flex flex-col items-center justify-center py-24 gap-4`}>
      <div className="w-20 h-20 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-2xl shadow-[#2D6A4F]/40 animate-[scaleIn_0.5s_cubic-bezier(0.16,1,0.3,1)]">
        <Check size={40} className="text-white" strokeWidth={3} />
      </div>
      <div className="text-center">
        <p className="text-xl font-extrabold">{t("wizardDoneTitle").replace("{bank}", bankName)}</p>
        <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
          <Sparkles size={12} className="text-primary" /> {t("wizardDoneSubtitle")}
        </p>
      </div>
    </div>
  );
}
