"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useT, useLocaleCode } from "@/lib/i18n";
import {
  X, ChevronLeft, ChevronRight, Check, Upload, FileText, AlertCircle,
  Sparkles, Plus, Wallet, Bug, Send, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankLogo, BANK_LOGOS } from "@/components/bank-logos";
import { CategoryIcon } from "@/components/category-icon";
import { getCategoryInfo } from "@/lib/categories";
import { ImportProgressOverlay, type ImportPhase } from "@/components/import-progress-overlay";
import { usePremium } from "@/components/premium/premium-provider";

type Step = "account" | "upload" | "analyze" | "balance" | "review" | "saving" | "done";

interface Account {
  id: number;
  slug: string;
  name: string;
  color: string;
  currency: string;
  scope_label?: string | null;
}

interface PreviewTx {
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "income" | "expense";
  is_internal?: boolean;
}

interface PreviewItem {
  transaction: PreviewTx;
  isDuplicate: boolean;
  category: string | null;
  expense_type: string | null;
  ai_categorized?: boolean;
  selected?: boolean;
}

interface PreviewData {
  format: string;
  transactions: PreviewItem[];
  finalBalances: Record<string, number> | null;
  summary: {
    total: number;
    new: number;
    duplicates: number;
    uncategorized: number;
    internal: number;
  };
}

interface DoneResult {
  imported: number;
  skipped: number;
  uncategorized: number;
}

export function ImportWizard() {
  const t = useT();
  const router = useRouter();
  const localeCode = useLocaleCode();
  const premium = usePremium();

  const [step, setStep] = useState<Step>("account");
  const [dir, setDir] = useState<"forward" | "back">("forward");

  // Account
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [account, setAccount] = useState<Account | null>(null);

  // File
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");

  // Analyze
  const [analyzePhase, setAnalyzePhase] = useState<ImportPhase | undefined>(undefined);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Review
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // Balance step
  const [detectedBalance, setDetectedBalance] = useState<number | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceConfirmed, setBalanceConfirmed] = useState<number | null>(null);

  // Saving
  const [saveStartedAt, setSaveStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<DoneResult | null>(null);

  // Error report
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  function goNext(next: Step) {
    setError("");
    setReportSent(false);
    setDir("forward");
    setStep(next);
  }
  function goBack(prev: Step) {
    setError("");
    setReportSent(false);
    setDir("back");
    setStep(prev);
  }

  const slideClass = dir === "forward"
    ? "animate-[slideInRight_0.3s_ease-out]"
    : "animate-[slideInLeft_0.3s_ease-out]";

  // Load accounts
  useEffect(() => {
    apiFetch("/api/accounts?transactions=0")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  // When file selected, auto-advance to analyze
  useEffect(() => {
    if (step === "upload" && file) {
      goNext("analyze");
      void handleAnalyze(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, file]);

  async function sendErrorReport(notes: string): Promise<boolean> {
    if (!file || !error) return false;
    setReportSending(true);
    try {
      const payload = await fileToPayload(file);
      const fileType = payload.pdfBase64 ? "pdf" : payload.excelBase64 ? "excel" : "csv";
      const res = await apiFetch("/api/report-import-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error_message: error,
          file_type: fileType,
          file_name: fileName || `extracto.${fileType}`,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          notes,
          file_base64: payload.pdfBase64 ?? payload.excelBase64,
          csv_text: payload.csvText,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const { toast } = await import("sonner");
        toast.error(data.error || "No se pudo enviar el reporte");
        return false;
      }
      setReportSent(true);
      return true;
    } catch {
      const { toast } = await import("sonner");
      toast.error("No se pudo enviar el reporte");
      return false;
    } finally {
      setReportSending(false);
    }
  }

  async function fileToPayload(f: File): Promise<{ csvText?: string; pdfBase64?: string; excelBase64?: string }> {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (ext === "csv" || f.type.includes("csv")) {
      return { csvText: await f.text() };
    }
    if (ext === "pdf" || f.type.includes("pdf")) {
      const buf = await f.arrayBuffer();
      return { pdfBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
    }
    const buf = await f.arrayBuffer();
    return { excelBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
  }

  async function handleAnalyze(f: File) {
    if (!account) return;
    setAnalyzePhase("reading");
    setAnalyzeStartedAt(Date.now());
    try {
      const payload = await fileToPayload(f);
      setAnalyzePhase("analyzing");
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action: "preview", targetAccount: account.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("importError"));

      // Pre-select all non-duplicates, non-internal
      const txs: PreviewItem[] = (data.transactions ?? []).map((it: PreviewItem) => ({
        ...it,
        selected: !it.isDuplicate && !it.transaction.is_internal,
      }));
      setPreview({
        format: data.format,
        transactions: txs,
        finalBalances: data.finalBalances ?? null,
        summary: data.summary,
      });

      // Try to extract the detected balance for this account.
      const balances = data.finalBalances ?? null;
      let detected: number | null = null;
      if (balances && account) {
        if (typeof balances[account.slug] === "number") {
          detected = balances[account.slug];
        } else {
          // If there's exactly one balance key we assume it's ours (the parser
          // doesn't always use the account slug as the key).
          const values = Object.values(balances);
          if (values.length === 1 && typeof values[0] === "number") {
            detected = values[0] as number;
          }
        }
      }
      setDetectedBalance(detected);
      setBalanceInput(detected !== null ? detected.toFixed(2) : "");
      goNext("balance");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("importError"));
      setAnalyzePhase(undefined);
    }
  }

  async function handleImport() {
    if (!account || !file || !preview) return;
    setSaveStartedAt(Date.now());
    goNext("saving");
    try {
      const payload = await fileToPayload(file);
      // Send the selected indexes so backend includes only those.
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action: "import",
          targetAccount: account.slug,
          skipDuplicateCheck: false,
          includeInternal: preview.transactions.some((it) => it.selected && it.transaction.is_internal),
          userBalance: balanceConfirmed ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("importError"));
      setResult({
        imported: data.imported ?? 0,
        skipped: data.skipped ?? 0,
        uncategorized: data.uncategorized ?? 0,
      });
      if ((data.imported ?? 0) > 0) {
        premium.importSuccess(data.imported);
      }
      goNext("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("importError"));
      goBack("review");
    }
  }

  function closeOrBack() {
    if (step === "account" || step === "done") {
      router.push("/transactions");
      return;
    }
    if (step === "upload") return goBack("account");
    if (step === "balance") return goBack("upload");
    if (step === "review") return goBack("balance");
    // Don't allow closing during analyze/saving
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header
        className="shrink-0 flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          onClick={closeOrBack}
          disabled={step === "analyze" || step === "saving"}
          className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90 transition-all disabled:opacity-40"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>
        <WizardProgress step={step} />
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28">
        {step === "account" && (
          <StepAccount
            className={slideClass}
            accounts={accounts}
            selected={account}
            onPick={(a) => {
              setAccount(a);
              goNext("upload");
            }}
            onCreate={() => router.push("/accounts/new")}
          />
        )}

        {step === "upload" && account && (
          <StepUpload
            className={slideClass}
            account={account}
            fileRef={fileRef}
            onPick={(f) => {
              setFile(f);
              setFileName(f.name);
            }}
            onBack={() => goBack("account")}
          />
        )}

        {step === "analyze" && analyzeStartedAt && (
          <StepAnalyze
            className={slideClass}
            startedAt={analyzeStartedAt}
            phase={analyzePhase}
            bankName={account?.name ?? ""}
            fileName={fileName}
            fileSizeKB={file ? Math.round(file.size / 1024) : undefined}
            error={error}
            canReport={!!file}
            reportSent={reportSent}
            reportSending={reportSending}
            onReport={sendErrorReport}
            onRetry={() => {
              setError("");
              goBack("upload");
            }}
          />
        )}

        {step === "balance" && account && (
          <StepBalance
            className={slideClass}
            account={account}
            detected={detectedBalance}
            value={balanceInput}
            setValue={setBalanceInput}
            onBack={() => goBack("upload")}
            onContinue={() => {
              const parsed = parseFloat(balanceInput.replace(/[^\d,.-]/g, "").replace(",", "."));
              setBalanceConfirmed(isFinite(parsed) ? parsed : null);
              goNext("review");
            }}
          />
        )}

        {step === "review" && preview && account && (
          <StepReview
            className={slideClass}
            account={account}
            preview={preview}
            onToggle={(i) => {
              const next = {
                ...preview,
                transactions: preview.transactions.map((it, idx) =>
                  idx === i ? { ...it, selected: !it.selected } : it,
                ),
              };
              setPreview(next);
            }}
            onSelectAll={() => setPreview({
              ...preview,
              transactions: preview.transactions.map((it) => ({
                ...it,
                selected: !it.isDuplicate,
              })),
            })}
            onDeselectAll={() => setPreview({
              ...preview,
              transactions: preview.transactions.map((it) => ({ ...it, selected: false })),
            })}
            onDeselectDuplicates={() => setPreview({
              ...preview,
              transactions: preview.transactions.map((it) => (
                it.isDuplicate ? { ...it, selected: false } : it
              )),
            })}
            onConfirm={handleImport}
            onBack={() => goBack("upload")}
            localeCode={localeCode}
            error={error}
          />
        )}

        {step === "saving" && saveStartedAt && account && (
          <StepSaving
            className={slideClass}
            startedAt={saveStartedAt}
            bankName={account.name}
            txCount={preview?.transactions.filter((it) => it.selected).length ?? 0}
          />
        )}

        {step === "done" && result && account && (
          <StepDone
            className={slideClass}
            result={result}
            account={account}
            onAnother={() => {
              // Reset state and go back to step 1
              setFile(null);
              setFileName("");
              setPreview(null);
              setResult(null);
              setAnalyzePhase(undefined);
              setAnalyzeStartedAt(null);
              setSaveStartedAt(null);
              setDir("forward");
              setStep("upload");
            }}
            onGoTransactions={() => router.push("/transactions")}
          />
        )}
      </main>
    </div>
  );
}

/* ── progress dots ── */
function WizardProgress({ step }: { step: Step }) {
  const ORDER: Step[] = ["account", "upload", "analyze", "balance", "review", "saving"];
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

/* ── Step 1: pick account ── */
function StepAccount({
  className, accounts, selected, onPick, onCreate,
}: {
  className: string;
  accounts: Account[] | null;
  selected: Account | null;
  onPick: (a: Account) => void;
  onCreate: () => void;
}) {
  const t = useT();
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("importWizardAccountTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("importWizardAccountSubtitle")}</p>
      </div>

      {!accounts ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center">
            <Wallet size={24} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("importWizardNoAccountsTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("importWizardNoAccountsDesc")}</p>
          </div>
          <Button onClick={onCreate} className="bg-primary hover:bg-primary/90 rounded-xl">
            <Plus size={16} className="mr-1.5" /> {t("addAccount")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => onPick(a)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                  selected?.id === a.id ? "border-primary bg-accent" : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                {BANK_LOGOS[a.slug] ? (
                  <BankLogo bank={a.slug} size={40} className="shrink-0" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {a.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {a.scope_label ?? t("labelPersonal")} · {a.currency}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground/40" />
              </button>
            ))}
          </div>

          <button
            onClick={onCreate}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-dashed border-border bg-card active:scale-[0.99] transition-all"
          >
            <span className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <Plus size={16} className="text-muted-foreground" />
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold">{t("importWizardCreateAccountCta")}</p>
              <p className="text-[11px] text-muted-foreground">{t("importWizardCreateAccountDesc")}</p>
            </div>
          </button>
        </>
      )}
    </div>
  );
}

/* ── Step 2: upload file ── */
function StepUpload({
  className, account, fileRef, onPick, onBack,
}: {
  className: string;
  account: Account;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (f: File) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className={`${className} pt-4 space-y-5`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">
          {t("importWizardUploadTitle").replace("{bank}", account.name)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("importWizardUploadSubtitle")}</p>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={`rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-primary/40 bg-accent hover:bg-primary/5"
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto mb-4 flex items-center justify-center">
          <Upload className="text-primary" size={28} />
        </div>
        <p className="text-base font-bold mb-1">{t("importWizardDropzoneTitle")}</p>
        <p className="text-xs text-muted-foreground mb-4">{t("importWizardDropzoneDesc")}</p>
        <Button
          variant="outline"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          className="rounded-xl"
        >
          <FileText size={14} className="mr-1.5" /> {t("selectFile")}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.pdf,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {t("importPrivacyBody")}
      </p>
    </div>
  );
}

/* ── Step 3: analyze ── */
function StepAnalyze({
  className, startedAt, phase, bankName, fileName, fileSizeKB, error, onRetry,
  canReport, reportSent, reportSending, onReport,
}: {
  className: string;
  startedAt: number;
  phase: ImportPhase | undefined;
  bankName: string;
  fileName: string;
  fileSizeKB?: number;
  error: string;
  onRetry: () => void;
  canReport: boolean;
  reportSent: boolean;
  reportSending: boolean;
  onReport: (notes: string) => Promise<boolean>;
}) {
  const t = useT();
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportNotes, setReportNotes] = useState("");

  return (
    <div className={`${className} pt-4 space-y-5`}>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">
          {t("importWizardAnalyzeTitle").replace("{bank}", bankName)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("importWizardAnalyzeSubtitle")}</p>
      </div>

      {!error ? (
        <ImportProgressOverlay
          open
          mode="preview"
          startedAt={startedAt}
          phase={phase}
          fileName={fileName}
          fileSizeKB={fileSizeKB}
        />
      ) : (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-destructive shrink-0 mt-0.5" size={20} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-destructive">{t("importStageFailedTitle")}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
          <Button onClick={onRetry} className="w-full rounded-xl bg-primary hover:bg-primary/90">
            {t("retry")}
          </Button>
          {canReport && (
            reportSent ? (
              <p className="text-[12px] text-[#2D6A4F] font-medium flex items-center gap-1.5 justify-center pt-1">
                <CheckCircle2 size={14} /> {t("importReportSent")}
              </p>
            ) : (
              <Button
                onClick={() => setShowReportModal(true)}
                variant="outline"
                className="w-full rounded-xl gap-2"
                disabled={reportSending}
              >
                <Bug size={14} /> {t("importReportError")}
              </Button>
            )
          )}
        </div>
      )}

      {showReportModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
          onClick={() => !reportSending && setShowReportModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border shadow-2xl p-6"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#2D6A4F]/10 flex items-center justify-center">
                <Bug className="text-[#2D6A4F]" size={20} />
              </div>
              <p className="text-base font-bold">{t("importReportModalTitle")}</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t("importReportModalBody")}</p>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("importReportNotesLabel")}</label>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value.slice(0, 2000))}
              placeholder={t("importReportNotesPlaceholder")}
              rows={4}
              disabled={reportSending}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/40"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 h-11 rounded-2xl" onClick={() => setShowReportModal(false)} disabled={reportSending}>
                {t("cancel")}
              </Button>
              <Button
                className="flex-1 h-11 rounded-2xl gap-2"
                onClick={async () => {
                  const ok = await onReport(reportNotes);
                  if (ok) setShowReportModal(false);
                }}
                disabled={reportSending}
              >
                {reportSending ? t("sending") : <><Send size={16} /> {t("send")}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Step 4: review transactions ── */
/* ── Step 3.5: balance (between analyze and review) ── */
function StepBalance({
  className, account, detected, value, setValue, onBack, onContinue,
}: {
  className: string;
  account: Account;
  detected: number | null;
  value: string;
  setValue: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const sym = account.currency === "USD" ? "$" : account.currency === "GBP" ? "£" : "€";
  const parsedValue = parseFloat(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  const canContinue = detected !== null || (isFinite(parsedValue) && value.trim() !== "");

  return (
    <div className={`${className} pt-4 space-y-6`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>

      {detected !== null ? (
        <>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">
              {t("importWizardBalanceDetectedTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("importWizardBalanceDetectedSubtitle").replace("{bank}", account.name)}
            </p>
          </div>

          <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent p-8 text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-light text-muted-foreground/70">{sym}</span>
              <span className="text-6xl font-extrabold tabular-nums tracking-tight">
                {detected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
              <Sparkles size={12} className="text-primary" />
              {t("importWizardBalanceDetectedHint")}
            </p>
          </div>

          <details className="text-center">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none">
              {t("importWizardBalanceEdit")}
            </summary>
            <div className="mt-3 flex items-baseline justify-center gap-1">
              <span className="text-xl font-light text-muted-foreground/50">{sym}</span>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="text-2xl font-bold text-center w-48 bg-transparent border-b border-border outline-none tabular-nums focus:border-primary py-1"
              />
            </div>
          </details>
        </>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">
              {t("importWizardBalanceMissingTitle")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("importWizardBalanceMissingSubtitle")}
            </p>
          </div>

          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-amber-900">
              {t("importWizardBalanceMissingHint")}
            </p>
          </div>

          <div className="flex items-baseline justify-center gap-1 py-6">
            <span className="text-3xl font-light text-muted-foreground/50">{sym}</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              autoFocus
              className="text-5xl font-extrabold text-center w-56 bg-transparent border-none outline-none tabular-nums placeholder:text-muted-foreground/20"
            />
          </div>
        </>
      )}

      <div className="pt-2 space-y-2">
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold disabled:opacity-40"
        >
          {detected !== null ? t("importWizardBalanceConfirm") : t("next")}
          <ChevronRight size={16} className="ml-1" />
        </Button>
        {detected === null && (
          <button
            onClick={() => {
              setValue("");
              onContinue();
            }}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("importWizardBalanceSkip")}
          </button>
        )}
      </div>
    </div>
  );
}

function StepReview({
  className, account, preview, onToggle, onSelectAll, onDeselectAll,
  onDeselectDuplicates, onConfirm, onBack, localeCode, error,
}: {
  className: string;
  account: Account;
  preview: PreviewData;
  onToggle: (i: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeselectDuplicates: () => void;
  onConfirm: () => void;
  onBack: () => void;
  localeCode: string;
  error: string;
}) {
  const t = useT();
  const total = preview.transactions.length;
  const selected = preview.transactions.filter((it) => it.selected).length;
  const duplicates = preview.transactions.filter((it) => it.isDuplicate).length;
  const netTotal = preview.transactions.reduce((acc, it) => {
    if (!it.selected) return acc;
    const signed = it.transaction.direction === "expense" ? it.transaction.amount : -it.transaction.amount;
    return acc + signed;
  }, 0);
  const sym = account.currency === "USD" ? "$" : account.currency === "GBP" ? "£" : "€";

  return (
    <div className={`${className} pt-4 space-y-4`}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground active:scale-95 transition-transform">
        <ChevronLeft size={16} /> {t("back")}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">{t("importWizardReviewTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("importWizardReviewSubtitle").replace("{total}", String(total)).replace("{bank}", account.name)}
        </p>
        <FormatBadge format={preview.format} />
      </div>

      {duplicates > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <p className="text-[11px] font-medium text-amber-800 flex items-center gap-2 min-w-0">
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate">{duplicates} {t("possibleDuplicatesDetected")}</span>
          </p>
          <button
            onClick={onDeselectDuplicates}
            className="text-[11px] font-semibold text-amber-900 hover:underline shrink-0"
          >
            {t("multiDeselectDuplicates")}
          </button>
        </div>
      )}

      {/* Import button pinned at the top for quick access on long lists */}
      <div className="space-y-2">
        <Button
          onClick={onConfirm}
          disabled={selected === 0}
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-xl shadow-[#2D6A4F]/20 active:scale-[0.97] transition-all disabled:opacity-40"
        >
          <Check size={18} className="mr-2" /> {t("importWizardConfirmCta").replace("{n}", String(selected))}
        </Button>
        {selected > 0 && (
          <div className="flex items-center justify-between px-1 text-[11px]">
            <span className="text-muted-foreground">{t("netTotal")}</span>
            <span className={`tabular-nums font-semibold ${netTotal >= 0 ? "text-foreground" : "text-[#2D6A4F]"}`}>
              {netTotal >= 0 ? "-" : "+"}{sym}{Math.abs(netTotal).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {selected}/{total} {t("selectedPlural")}
        </span>
        <button
          onClick={selected === total ? onDeselectAll : onSelectAll}
          className="text-primary font-semibold hover:underline"
        >
          {selected === total ? t("deselectAll") : t("selectAll")}
        </button>
      </div>

      <div className="space-y-2">
        {preview.transactions.map((it, i) => {
          const cat = getCategoryInfo(it.category ?? "otros");
          const dateLabel = it.transaction.date
            ? new Date(it.transaction.date + "T00:00:00").toLocaleDateString(localeCode, { day: "numeric", month: "short" })
            : "—";
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={`w-full rounded-2xl border text-left transition-all active:scale-[0.99] ${
                it.selected
                  ? "border-primary/40 bg-primary/5 shadow-sm"
                  : "border-border bg-card opacity-70"
              } ${it.isDuplicate ? "ring-1 ring-amber-400/40" : ""}`}
            >
              <div className="flex items-start gap-3 p-4">
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    it.selected ? "bg-[#2D6A4F] border-[#2D6A4F]" : "border-muted-foreground/30 bg-background"
                  }`}
                >
                  {it.selected && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
                <CategoryIcon icon={cat.icon} color={cat.color} size="sm" withBackground={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{it.transaction.description || t("noDescription")}</p>
                    <p className={`text-sm font-bold tabular-nums shrink-0 ${it.transaction.direction === "income" ? "text-[#2D6A4F]" : "text-foreground"}`}>
                      {it.transaction.direction === "income" ? "+" : "-"}{sym}{it.transaction.amount.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">{dateLabel}</span>
                    <span className="text-[11px] text-muted-foreground">· {cat.label}</span>
                    {it.ai_categorized && (
                      <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-semibold">
                        <Sparkles size={9} className="inline -mt-0.5 mr-0.5" />auto
                      </span>
                    )}
                    {it.isDuplicate && (
                      <span className="text-[10px] text-amber-800 bg-amber-500/15 px-2 py-0.5 rounded-full font-semibold">
                        {t("possibleDuplicate")}
                      </span>
                    )}
                    {it.transaction.is_internal && (
                      <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-semibold">
                        {t("summaryInternal")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center bg-destructive/5 rounded-xl p-3">{error}</p>
      )}
    </div>
  );
}

/* ── Step 5: saving ── */
function StepSaving({
  className, startedAt, bankName, txCount,
}: {
  className: string;
  startedAt: number;
  bankName: string;
  txCount: number;
}) {
  const t = useT();
  return (
    <div className={`${className} pt-4 space-y-5`}>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">
          {t("importWizardSavingTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("importWizardSavingSubtitle").replace("{bank}", bankName)}
        </p>
      </div>
      <ImportProgressOverlay
        open
        mode="import"
        startedAt={startedAt}
        txCount={txCount}
      />
    </div>
  );
}

/* ── Step 6: done ── */
function StepDone({
  className, result, account, onAnother, onGoTransactions,
}: {
  className: string;
  result: DoneResult;
  account: Account;
  onAnother: () => void;
  onGoTransactions: () => void;
}) {
  const t = useT();
  return (
    <div className={`${className} pt-8 space-y-6`}>
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-20 h-20 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-2xl shadow-[#2D6A4F]/40 animate-[scaleIn_0.5s_cubic-bezier(0.16,1,0.3,1)]">
          <Check size={40} className="text-white" strokeWidth={3} />
        </div>
        <div className="text-center">
          <p className="text-2xl font-extrabold">
            {t("importWizardDoneTitle").replace("{n}", String(result.imported))}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("importWizardDoneSubtitle").replace("{bank}", account.name)}
          </p>
        </div>
      </div>

      {/* Recap card — solo 2 datos simples, no el dashboard anterior de 6 cajas */}
      <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("importWizardRecapImported")}</span>
          <span className="text-lg font-bold text-[#2D6A4F] tabular-nums">{result.imported}</span>
        </div>
        {result.skipped > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("importWizardRecapSkipped")}</span>
            <span className="text-base font-semibold text-muted-foreground tabular-nums">{result.skipped}</span>
          </div>
        )}
        {result.uncategorized > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("importWizardRecapUncategorized")}</span>
            <span className="text-base font-semibold text-amber-600 tabular-nums">{result.uncategorized}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={onGoTransactions}
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-bold"
        >
          {t("importWizardGoTransactions")}
        </Button>
        <Button
          variant="outline"
          onClick={onAnother}
          className="w-full h-12 rounded-2xl"
        >
          {t("importWizardAnother")}
        </Button>
      </div>
    </div>
  );
}

/* Small badge below the review header showing what Fintrk detected.
 * Gives the user a visible signal of which path the import took so they
 * trust the result (or raise a flag if it looks wrong). */
function FormatBadge({ format }: { format: string }) {
  const t = useT();
  const lower = format.toLowerCase();
  let label = "";
  let tone: "native" | "standard" | "ai" | "auto" = "native";

  if (lower === "vision" || lower === "ai-fallback") {
    label = t("importFormatBadgeAI") || "Detectado con IA";
    tone = "ai";
  } else if (lower === "ofx" || lower === "qif" || lower === "camt053" || lower === "mt940") {
    label = `${t("importFormatBadgePrefix") || "Formato"}: ${format.toUpperCase()}`;
    tone = "standard";
  } else if (lower === "generic (auto)" || lower === "generic-pdf" || lower === "generic") {
    label = t("importFormatBadgeAuto") || "Auto-detectado";
    tone = "auto";
  } else if (lower.endsWith("-pdf")) {
    const bank = format.replace(/-pdf$/i, "");
    label = `${t("importFormatBadgePrefix") || "Formato"}: ${bank.toUpperCase()} PDF`;
    tone = "native";
  } else if (lower) {
    label = `${t("importFormatBadgePrefix") || "Formato"}: ${format.toUpperCase()}`;
    tone = "native";
  }

  if (!label) return null;

  const styles = {
    native: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
    standard: "bg-blue-500/10 text-blue-700",
    ai: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
    auto: "bg-amber-500/10 text-amber-700",
  }[tone];

  return (
    <span className={`inline-block mt-2 text-[11px] font-medium rounded-full px-2.5 py-0.5 ${styles}`}>
      {label}
    </span>
  );
}
