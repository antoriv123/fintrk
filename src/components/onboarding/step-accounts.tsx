"use client";
import { apiFetch } from "@/lib/api";

import { useRef, useState } from "react";
import {
  Upload, CheckCircle2, ChevronLeft, FileText, Pencil,
  Loader2, Sparkles, Database, FileSearch, AlertCircle, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { OnboardingStepProps, AccountSetup } from "./types";

type ImportStage = "idle" | "reading" | "uploading" | "analyzing" | "categorizing" | "saving" | "done" | "error";

interface ImportState {
  stage: ImportStage;
  error?: string;
  total?: number;
  duplicates?: number;
}

export function StepAccounts({ state, onNext, onBack, onUpdate, goTo }: OnboardingStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});

  // Initialize accountSetups if not in sync with selectedBanks
  if (state.accountSetups.length !== state.selectedBanks.length) {
    const initialized: AccountSetup[] = state.selectedBanks.map((bank) => ({
      slug: bank.slug,
      name: bank.name,
      color: bank.color,
      mode: "import",
      balance: 0,
      importedCount: 0,
    }));
    onUpdate({ accountSetups: initialized });
    return null;
  }

  function updateAccountSetup(slug: string, partial: Partial<AccountSetup>) {
    const next = state.accountSetups.map((acc) =>
      acc.slug === slug ? { ...acc, ...partial } : acc
    );
    onUpdate({ accountSetups: next });
  }

  function setStage(slug: string, stage: ImportStage, extra?: Partial<ImportState>): void {
    setImportStates((prev) => ({ ...prev, [slug]: { stage, ...extra } }));
  }

  async function fileToPayload(file: File): Promise<{
    csvText?: string;
    pdfBase64?: string;
    excelBase64?: string;
  }> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext === "csv" || file.type.includes("csv")) {
      return { csvText: await file.text() };
    }
    if (ext === "pdf" || file.type.includes("pdf")) {
      const buf = await file.arrayBuffer();
      return { pdfBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
    }
    // default to excel
    const buf = await file.arrayBuffer();
    return { excelBase64: btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), "")) };
  }

  async function handleFileSelect(slug: string, name: string, color: string, file: File): Promise<void> {
    const country = state.country;
    const currency = country?.currency ?? "EUR";

    // 1) read
    setStage(slug, "reading");

    let payload: Awaited<ReturnType<typeof fileToPayload>>;
    try {
      payload = await fileToPayload(file);
    } catch {
      setStage(slug, "error", { error: t("importStageErrorRead") });
      return;
    }

    // 2) ensure the account exists (so transactions can reference it)
    setStage(slug, "uploading");
    try {
      const ensureRes = await apiFetch("/api/onboarding/ensure-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, color, currency, initialBalance: 0 }),
      });
      if (!ensureRes.ok) {
        setStage(slug, "error", { error: t("importStageErrorAccount") });
        return;
      }
    } catch {
      setStage(slug, "error", { error: t("importStageErrorAccount") });
      return;
    }

    // 3) preview — parse + categorize (may take several seconds with AI)
    setStage(slug, "analyzing");
    let previewData: {
      transactions?: Array<{ isDuplicate?: boolean }>;
      summary?: { total: number; duplicates: number; new: number };
      error?: string;
    } = {};
    try {
      const previewRes = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action: "preview",
          targetAccount: slug,
        }),
      });
      previewData = await previewRes.json().catch(() => ({} as typeof previewData));
      if (!previewRes.ok) {
        setStage(slug, "error", { error: previewData?.error ?? t("importStageErrorAnalyze") });
        return;
      }
    } catch {
      setStage(slug, "error", { error: t("importStageErrorAnalyze") });
      return;
    }

    const txCount = previewData.summary?.new ?? previewData.transactions?.length ?? 0;
    if (txCount === 0) {
      setStage(slug, "error", { error: t("importStageNoTransactions") });
      return;
    }

    // 4) confirm import — actually insert
    setStage(slug, "saving", { total: txCount });
    try {
      const importRes = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action: "import",
          targetAccount: slug,
        }),
      });
      const importData = await importRes.json().catch(() => ({}));
      if (!importRes.ok) {
        setStage(slug, "error", { error: importData?.error ?? t("importStageErrorSave") });
        return;
      }

      const imported = importData.imported ?? txCount;
      setStage(slug, "done", {
        total: imported,
        duplicates: previewData.summary?.duplicates ?? 0,
      });
      updateAccountSetup(slug, { mode: "imported", importedCount: imported });
    } catch {
      setStage(slug, "error", { error: t("importStageErrorSave") });
    }
  }

  function retry(slug: string): void {
    setStage(slug, "idle");
    fileInputRefs.current[slug]?.click();
  }

  // Empty state when user skipped the banks step
  if (state.selectedBanks.length === 0) {
    return (
      <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-400">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
            <ChevronLeft size={16} />
            {t("back")}
          </button>
        )}
        <div className="flex flex-col items-center gap-4 text-center pt-8">
          <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
            <Landmark size={36} className="text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("noBanksSelected")}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px]">
              {t("noBanksSelectedDesc")}
            </p>
          </div>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => goTo?.("banks")}
          >
            {t("addABank")}
          </Button>
        </div>
        <Button className="w-full" size="lg" onClick={onNext}>
          {t("continueWithoutBanks")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-400">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2 mb-2">
          <ChevronLeft size={16} />
          {t("back")}
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold">{t("setupAccounts")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("importToSeeHistory")}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {state.accountSetups.map((acc, i) => {
          const importState = importStates[acc.slug]?.stage ?? "idle";
          const isProcessing = importState !== "idle" && importState !== "done" && importState !== "error";
          return (
            <div
              key={acc.slug}
              className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: "both",
              }}
            >
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {acc.name}
              </p>


              {/* Processing state */}
              {isProcessing && (
                <ImportProgress stage={importState} accountName={acc.name} />
              )}

              {/* Success state */}
              {acc.mode === "imported" && importState === "done" && (
                <div className="bg-accent rounded-xl p-4 text-center animate-in zoom-in duration-300">
                  <CheckCircle2 className="mx-auto mb-1.5 text-primary" size={28} />
                  <p className="font-semibold text-sm">{t("statementImported")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {acc.importedCount} {t("transactionsFound")}
                    {importStates[acc.slug]?.duplicates ? (
                      <> · {importStates[acc.slug]?.duplicates} {t("duplicatesSkipped")}</>
                    ) : null}
                  </p>
                </div>
              )}

              {/* Import zone — hidden while processing or after successful import */}
              {!isProcessing && importState !== "done" && (
                <>
                  <div
                    className="border-2 border-dashed border-primary bg-accent rounded-xl p-5 text-center cursor-pointer"
                    onClick={() => fileInputRefs.current[acc.slug]?.click()}
                  >
                    <Upload className="mx-auto mb-2 text-primary" size={24} />
                    <p className="text-sm font-semibold">{t("dragStatementHere")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("csvOrPdfOf")} {acc.name}
                    </p>
                    <input
                      ref={(el) => { fileInputRefs.current[acc.slug] = el; }}
                      type="file"
                      accept=".csv,.pdf,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(acc.slug, acc.name, acc.color, file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRefs.current[acc.slug]?.click();
                      }}
                    >
                      {t("selectFile")}
                    </Button>
                  </div>

                  {/* Error state */}
                  {importState === "error" && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
                      <AlertCircle className="text-destructive shrink-0 mt-0.5" size={18} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-destructive">{t("importStageFailedTitle")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {importStates[acc.slug]?.error ?? t("importStageErrorGeneric")}
                        </p>
                        <button onClick={() => retry(acc.slug)} className="text-xs font-semibold text-primary hover:underline mt-2">
                          {t("retry")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual balance — always visible below import zone */}
                  <div className="flex items-center gap-3 text-muted-foreground/40">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] font-medium shrink-0">{t("orJustBalance")}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
                    <Pencil size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground shrink-0">
                      {state.country?.symbol ?? "$"}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={acc.balance === 0 ? "" : String(acc.balance)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d,.-]/g, "").replace(",", ".");
                        const n = parseFloat(raw);
                        updateAccountSetup(acc.slug, {
                          mode: "balance",
                          balance: isFinite(n) ? n : 0,
                        });
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.replace(/[^\d,.-]/g, "").replace(",", ".");
                        const n = parseFloat(raw);
                        updateAccountSetup(acc.slug, {
                          balance: isFinite(n) ? Math.round(n * 100) / 100 : 0,
                        });
                      }}
                      placeholder={t("currentBalancePlaceholder")}
                      className="flex-1 text-sm bg-transparent border-none outline-none tabular-nums placeholder:text-muted-foreground/30"
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Button className="w-full" size="lg" onClick={onNext} disabled={Object.values(importStates).some((s) => s.stage !== "idle" && s.stage !== "done" && s.stage !== "error")}>
          {t("nextArrow")}
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {t("canImportMoreLater")}
        </p>
      </div>
    </div>
  );
}

/* ── Import progress card — 4 visible stages with animation ── */
function ImportProgress({ stage, accountName }: { stage: ImportStage; accountName: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const stages: Array<{ id: ImportStage; label: string; icon: typeof FileText }> = [
    { id: "reading", label: t("importStageReading"), icon: FileText },
    { id: "uploading", label: t("importStageUploading"), icon: Upload },
    { id: "analyzing", label: t("importStageAnalyzing"), icon: FileSearch },
    { id: "saving", label: t("importStageSaving"), icon: Database },
  ];

  const currentIdx = stages.findIndex((s) => s.id === stage);
  const progressPct = ((currentIdx + 1) / stages.length) * 100;

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <Loader2 className="animate-spin text-primary" size={18} />
        <p className="text-sm font-semibold">
          <Sparkles size={12} className="inline -mt-0.5 mr-1 text-primary" />
          {t("importStageHeader").replace("{account}", accountName)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stage list */}
      <div className="space-y-1.5">
        {stages.map((s, idx) => {
          const active = idx === currentIdx;
          const done = idx < currentIdx;
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2.5 text-xs transition-all ${
                active ? "text-foreground font-semibold" : done ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                done ? "bg-primary/20" : active ? "bg-primary/15" : "bg-muted/30"
              }`}>
                {done ? (
                  <CheckCircle2 size={12} className="text-primary" />
                ) : active ? (
                  <Loader2 size={12} className="animate-spin text-primary" />
                ) : (
                  <Icon size={11} />
                )}
              </span>
              <span className="truncate">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
