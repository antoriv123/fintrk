"use client";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFetch } from "@/hooks/use-fetch";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { BankLogo, BankLogosStrip } from "@/components/bank-logos";
import {
  Upload,
  Search,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Info,
  X,
  FileText,
  Lightbulb,
  ChevronDown,
  ShieldCheck,
  Send,
  Bug,
} from "lucide-react";
import { ImportProgressOverlay } from "@/components/import-progress-overlay";

interface AccountInfo {
  slug: string;
  name: string;
  emoji: string;
  color: string;
}

type Direction = "income" | "expense";

interface PreviewTransaction {
  transaction: {
    date: string;
    description: string;
    amount: number;
    currency: string;
    direction: Direction;
    account?: string;
    is_internal?: boolean;
  };
  isDuplicate: boolean;
  matchedId?: number;
  category: string | null;
  expense_type: string | null;
  ai_categorized?: boolean;
  ai_confidence?: number;
}

interface PreviewResult {
  format: string;
  errors: string[];
  transactions: PreviewTransaction[];
  finalBalances: Record<string, number> | null;
  summary: {
    total: number;
    duplicates: number;
    new: number;
    uncategorized: number;
    ai_categorized?: number;
    internal: number;
  };
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  uncategorized: number;
}

const FORMAT_LABELS: Record<string, string> = {
  revolut: "Revolut",
  "revolut-pdf": "Revolut PDF",
  ing: "ING",
  n26: "N26",
  myinvestor: "MyInvestor",
  wise: "Wise",
  bunq: "Bunq",
  abn_amro: "ABN AMRO",
  rabobank: "Rabobank",
  bbva: "BBVA",
  santander: "Santander",
  caixabank: "CaixaBank",
  generic: "Generico",
  "generic (auto)": "Auto-detectado",
  "bunq-pdf": "Bunq PDF",
  "ing-pdf": "ING PDF",
  "generic-pdf": "PDF (auto)",
  "bank-pdf": "PDF bancario",
  vision: "PDF (Vision IA)",
  excel: "Excel",
  ofx: "OFX",
  qif: "QIF",
  camt053: "CAMT.053 (SEPA)",
  mt940: "MT940 (SWIFT)",
  BBVA: "BBVA",
  Santander: "Santander",
  CaixaBank: "CaixaBank",
  ING: "ING",
  Revolut: "Revolut",
  "Revolut ES": "Revolut",
  N26: "N26",
  Wise: "Wise",
};

export default function ImportPage() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [excelBase64, setExcelBase64] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [fileType, setFileType] = useState<"csv" | "pdf" | "excel">("csv");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string>("");
  const [includeInternal, setIncludeInternal] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [freshImport, setFreshImport] = useState(false);
  const [targetAccount, setTargetAccount] = useState<string>("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [userBalance, setUserBalance] = useState<string>("");
  const [balanceDetected, setBalanceDetected] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingMode, setLoadingMode] = useState<"preview" | "import">("preview");
  const [showPrivacyConsent, setShowPrivacyConsent] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportNotes, setReportNotes] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem("fintrk-import-privacy-seen");
      if (!seen) setShowPrivacyConsent(true);
    } catch { /* storage unavailable */ }
  }, []);

  const { data: accountsData, refresh: refreshAccounts } = useFetch<{ accounts: AccountInfo[] }>("/api/accounts");
  const accounts = accountsData?.accounts ?? [];

  // Extract CSV text processing into a reusable function (used by encoding retry)
  const processCSVText = useCallback((text: string) => {
    setCsvText(text);
    // Auto-detect format client-side for immediate UI feedback
    const firstLine = text.split("\n")[0].toLowerCase();
    let detected = "";
    if (
      (firstLine.includes("started date") && firstLine.includes("completed date")) ||
      (firstLine.includes("fecha de inicio") && firstLine.includes("fecha de finalizaci"))
    ) {
      detected = "revolut";
    } else if (firstLine.includes("naam") || firstLine.includes("af bij")) {
      detected = "ing";
    } else if (firstLine.includes("payee") && firstLine.includes("payment reference")) {
      detected = "n26";
    } else if (
      (firstLine.includes("fecha de valor") || firstLine.includes("fecha valor")) &&
      (firstLine.includes("concepto") || firstLine.includes("importe"))
    ) {
      detected = "myinvestor";
    } else if (
      firstLine.includes("transferwise id") ||
      (firstLine.includes("source currency") && firstLine.includes("target currency")) ||
      (firstLine.includes("date") && firstLine.includes("amount") && firstLine.includes("merchant"))
    ) {
      detected = "wise";
    } else if (
      (firstLine.includes("interest date") || firstLine.includes("rentedatum")) &&
      (firstLine.includes("counterparty") || firstLine.includes("tegenrekening"))
    ) {
      detected = "bunq";
    } else if (firstLine.includes("rekeningnummer") || firstLine.includes("transactiedatum")) {
      detected = "abn_amro";
    } else if (firstLine.includes("volgnr") || (firstLine.includes("iban") && firstLine.includes("muntsoort"))) {
      detected = "rabobank";
    } else if (
      (firstLine.includes("movimiento") && firstLine.includes("disponible")) ||
      (firstLine.includes("f.valor") && firstLine.includes("importe")) ||
      (firstLine.includes("fecha valor") && firstLine.includes("importe") && firstLine.includes("movimiento"))
    ) {
      detected = "bbva";
    } else if (firstLine.includes("fecha") && firstLine.includes("concepto") && firstLine.includes("saldo")) {
      detected = "santander";
    } else if ((firstLine.includes("data") && firstLine.includes("concepte")) || (firstLine.includes("movimiento") && firstLine.includes("oficina"))) {
      detected = "caixabank";
    }
    setFormat(detected);
  }, []);

  // Render PDF pages to JPEG images for vision-based AI parsing
  const renderPDFPages = useCallback(async (file: File) => {
    try {
      const pdfjsLib = await import("pdfjs-dist");

      // Use bundled worker via CDN to avoid webpack issues
      const version = pdfjsLib.version;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const images: string[] = [];
      const maxPages = Math.min(doc.numPages, 15);

      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        // pdfjs-dist v5 requires both canvas and canvasContext
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;

        // JPEG at 70% quality — ~100-150KB per page
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        images.push(dataUrl.split(",")[1]);
      }

      console.log(`[import] Rendered ${images.length} PDF pages to images`);
      setPageImages(images);
    } catch (err) {
      console.warn("[import] Could not render PDF pages for vision:", err);
      // Non-fatal — structured parser + text AI fallback still work
    } finally {
    }
  }, []);

  const sendErrorReport = useCallback(async () => {
    if (!error || !hasFile) return;
    setReportSending(true);
    try {
      const payload: Record<string, unknown> = {
        error_message: error,
        file_type: fileType,
        file_name: fileName || `extracto.${fileType}`,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        notes: reportNotes,
      };
      if (fileType === "pdf") payload.file_base64 = pdfBase64;
      else if (fileType === "excel") payload.file_base64 = excelBase64;
      else payload.csv_text = csvText;

      const res = await apiFetch("/api/report-import-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo enviar");
      setReportSent(true);
      setShowReportModal(false);
    } catch (e) {
      console.warn("[import] report send failed:", e);
      // Toast the user — fallback UI
      const { toast } = await import("sonner");
      toast.error(e instanceof Error ? e.message : "Error al enviar el reporte");
    } finally {
      setReportSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, fileType, fileName, pdfBase64, excelBase64, csvText, reportNotes]);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setError("");
    setPreview(null);
    setImportResult(null);
    setReportSent(false);
    setReportNotes("");
    setCsvText("");
    setPdfBase64("");
    setPageImages([]);
    setExcelBase64("");

    // Validate file size (max 10MB — Vercel body limit is ~4.5MB after base64,
    // but we skip pageImages for large PDFs to stay within limits)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setError(`El archivo es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 10MB. Intenta exportar un periodo más corto.`);
      return;
    }

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const isPDF = ext === "pdf" || file.type === "application/pdf";
    const isExcel = ext === "xlsx" || ext === "xls" ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";
    // Text-based formats — everything that we parse as text (CSV + open banking standards).
    // The server sniffs the actual format; here we just need to read it as text.
    const textExts = new Set(["csv", "txt", "ofx", "qfx", "qif", "xml", "camt", "sta", "mt940", "swi"]);
    const isTextFile = textExts.has(ext) || file.type === "text/csv" || file.type === "text/plain"
      || file.type === "application/x-ofx" || file.type === "application/xml" || file.type === "text/xml";

    if (!isPDF && !isExcel && !isTextFile) {
      setError(`Formato no soportado (.${ext}). Sube un archivo CSV, PDF, Excel, OFX, QIF, MT940 o CAMT.053.`);
      return;
    }

    setFileName(file.name);

    if (isPDF) {
      setFileType("pdf");
      setFormat("bank-pdf");
      setPageImages([]);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        setPdfBase64(base64);
      };
      reader.onerror = () => setError(t("fileReadError"));
      reader.readAsDataURL(file);
      // Render pages to images in parallel (for vision fallback)
      renderPDFPages(file);
    } else if (isExcel) {
      setFileType("excel");
      setFormat("excel");
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        setExcelBase64(base64);
      };
      reader.onerror = () => setError(t("fileReadError"));
      reader.readAsDataURL(file);
    } else {
      // All text-based formats (CSV, OFX, QIF, CAMT.053, MT940) are uploaded
      // as the csvText field — the server sniffs the format by content.
      setFileType("csv");
      // Read CSV with encoding auto-detection:
      // Try UTF-8 first. If the result contains replacement chars (common when
      // a Latin-1/Windows-1252 file is read as UTF-8), re-read with ISO-8859-1.
      const reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target?.result as string;

        // Detect encoding issues: UTF-8 decode of Latin-1 produces U+FFFD or mojibake patterns
        const hasReplacementChars = text.includes("\uFFFD");
        const hasMojibake = /Ã[©¡³ºñ±]/.test(text.slice(0, 500));
        if (hasReplacementChars || hasMojibake) {
          // Re-read as Latin-1 (ISO-8859-1)
          const reReader = new FileReader();
          reReader.onload = (e2) => {
            text = e2.target?.result as string;
            processCSVText(text);
          };
          reReader.onerror = () => setError(t("fileReadError"));
          reReader.readAsText(file, "ISO-8859-1");
          return;
        }

        processCSVText(text);
      };
      reader.onerror = () => setError(t("fileReadError"));
      reader.readAsText(file, "UTF-8");
    }
  }, [processCSVText, renderPDFPages, t]);

  const hasFile = csvText || pdfBase64 || excelBase64;

  const handlePreview = async () => {
    if (!hasFile) return;
    setLoading(true);
    setError("");
    setLoadingMode("preview");
    setLoadingStartedAt(Date.now());
    // Progressive loading messages. After ~15s we're almost certainly in the
    // AI fallback path (structured parser takes <1s), so switch to AI-specific
    // copy so the user knows nothing is stuck.
    try {
      const skipDup = skipDuplicates || freshImport;
      const acct = targetAccount || undefined;
      const payload = fileType === "excel"
        ? { excelBase64, action: "preview", skipDuplicateCheck: skipDup, targetAccount: acct }
        : fileType === "pdf"
        ? { pdfBase64, pageImages: pageImages.length > 0 && pdfBase64.length < 2 * 1024 * 1024 ? pageImages : undefined, action: "preview", skipDuplicateCheck: skipDup, targetAccount: acct }
        : { csvText, format: format || undefined, action: "preview", skipDuplicateCheck: skipDup, targetAccount: acct };
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("previewError"));
      setPreview(data);
      // Pre-fill balance if detected from bank statement
      if (data.finalBalances) {
        const values = Object.values(data.finalBalances) as number[];
        if (values.length > 0) {
          setUserBalance(values[0].toFixed(2));
          setBalanceDetected(true);
        }
      } else {
        setUserBalance("");
        setBalanceDetected(false);
      }
      // Update format to match what was actually detected by the parser
      if (data.format && data.format !== format) {
        setFormat(data.format);
      }
      // Pre-select: if fresh import, select ALL non-duplicates (including internal)
      // otherwise exclude internal from selection
      const shouldIncludeInternal = freshImport;
      if (shouldIncludeInternal) setIncludeInternal(true);
      const preSelected = new Set<number>(
        data.transactions
          .map((_: PreviewTransaction, i: number) => i)
          .filter(
            (i: number) =>
              !data.transactions[i].isDuplicate &&
              (shouldIncludeInternal || !data.transactions[i].transaction.is_internal)
          )
      );
      setSelected(preSelected);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("unknownError");
      // Vercel 502/504 timeout → friendly message
      if (msg.includes("502") || msg.includes("504") || msg.includes("FUNCTION_INVOCATION_TIMEOUT")) {
        setError(t("serverTimeout"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
        setLoadingStartedAt(null);
    }
  };

  const handleImport = async () => {
    if (!hasFile || !preview) return;
    setLoading(true);
    setError("");
    setImportResult(null);
    setLoadingMode("import");
    setLoadingStartedAt(Date.now());
    try {
      const skipDup = skipDuplicates || freshImport;
      const acct = targetAccount || preview?.transactions[0]?.transaction.account;
      const parsedBalance = userBalance.trim() ? parseFloat(userBalance.replace(",", ".")) : undefined;
      const balanceValue = parsedBalance !== undefined && !isNaN(parsedBalance) ? parsedBalance : undefined;
      const commonFields = {
        action: "import" as const,
        includeInternal,
        skipDuplicateCheck: skipDup,
        clearAccount: freshImport ? (acct ?? undefined) : undefined,
        targetAccount: targetAccount || undefined,
        userBalance: balanceValue,
      };
      const payload = fileType === "excel"
        ? { excelBase64, ...commonFields }
        : fileType === "pdf"
        ? { pdfBase64, pageImages: pageImages.length > 0 && pdfBase64.length < 2 * 1024 * 1024 ? pageImages : undefined, ...commonFields }
        : { csvText, format: format || undefined, ...commonFields };
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("importError"));
      setImportResult(data);
      setPreview(null);
      setCsvText("");
      setPdfBase64("");
      setPageImages([]);
      setExcelBase64("");
      setFileName("");
      setFormat("");
      setFileType("csv");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("unknownError");
      if (msg.includes("502") || msg.includes("504") || msg.includes("FUNCTION_INVOCATION_TIMEOUT")) {
        setError(t("serverTimeoutImport"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
        setLoadingStartedAt(null);
    }
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const resetAll = () => {
    setImportResult(null);
    setCsvText("");
    setPdfBase64("");
    setPageImages([]);
    setExcelBase64("");
    setFileName("");
    setFormat("");
    setFileType("csv");
    setPreview(null);
    setSelected(new Set());
    setError("");
    setUserBalance("");
    setBalanceDetected(false);
  };

  // Count how many will actually be imported (matches server logic)
  const importCount = preview
    ? preview.transactions.filter((t, i) => {
        if (t.isDuplicate) return false;
        if (t.transaction.is_internal) {
          // Internal included if: fresh import OR includeInternal toggle
          return freshImport || includeInternal;
        }
        return selected.has(i);
      }).length
    : 0;

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-lg sm:text-2xl font-bold">{t("importTitle")}</h1>

      {/* Tutorial */}
      {!hasFile && !importResult && (
        <button
          type="button"
          onClick={() => setTutorialOpen((v) => !v)}
          className="w-full rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-left transition-colors hover:bg-card/80"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Lightbulb size={16} className="text-primary shrink-0" />
              <span className="text-sm text-muted-foreground">{t("importTutorialTitle")}</span>
            </div>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform ${tutorialOpen ? "rotate-180" : ""}`}
            />
          </div>
          {tutorialOpen && (
            <div className="mt-3 ml-[26px] space-y-2.5 text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
              <ol className="list-none space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">1.</span>
                  {t("importTutorialStep1")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">2.</span>
                  {t("importTutorialStep2")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">3.</span>
                  {t("importTutorialStep3")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">4.</span>
                  {t("importTutorialStep4")}
                </li>
              </ol>
              <div className="pt-3">
                <BankLogosStrip size={26} />
              </div>
            </div>
          )}
        </button>
      )}

      {/* Upload zone */}
      {!hasFile && !importResult && (
        <Card>
          <CardContent className="pt-6">
            <div
              data-tour="import-dropzone"
              className={`border-2 border-dashed rounded-xl p-10 sm:p-16 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex justify-center mb-4">
                <Upload size={32} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm sm:text-base">
                {t("importDropzone")}
              </p>
              <p className="text-xs text-muted-foreground mt-2 mb-4">
                {t("importDropzoneFormats")}
              </p>
              <BankLogosStrip size={32} />
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,.xlsx,.xls,.ofx,.qfx,.qif,.xml,.camt,.sta,.mt940"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            {/* Trust message */}
            <div className="mt-4 flex items-start gap-2 px-1">
              <Info size={14} className="text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed text-left">
                {t("importTrustMessage")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Format detection + preview trigger */}
      {hasFile && !preview && !importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("fileLoaded")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{fileName}</span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-8 px-2"
                onClick={() => {
                  setCsvText("");
                  setPdfBase64("");
                  setExcelBase64("");
                  setFileName("");
                  setFormat("");
                  setFileType("csv");
                  setError("");
                }}
              >
                <X size={14} className="mr-1" />
                {t("changeFile")}
              </Button>
            </div>
            {fileType === "csv" ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">{t("formatLabel")}</span>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t("selectFormat")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revolut"><span className="flex items-center gap-2"><BankLogo bank="revolut" size={18} /> Revolut</span></SelectItem>
                    <SelectItem value="ing"><span className="flex items-center gap-2"><BankLogo bank="ing" size={18} /> ING</span></SelectItem>
                    <SelectItem value="n26"><span className="flex items-center gap-2"><BankLogo bank="n26" size={18} /> N26</span></SelectItem>
                    <SelectItem value="myinvestor"><span className="flex items-center gap-2"><BankLogo bank="myinvestor" size={18} /> MyInvestor</span></SelectItem>
                    <SelectItem value="wise"><span className="flex items-center gap-2"><BankLogo bank="wise" size={18} /> Wise</span></SelectItem>
                    <SelectItem value="bunq"><span className="flex items-center gap-2"><BankLogo bank="bunq" size={18} /> Bunq</span></SelectItem>
                    <SelectItem value="abn_amro">ABN AMRO</SelectItem>
                    <SelectItem value="rabobank"><span className="flex items-center gap-2"><BankLogo bank="rabobank" size={18} /> Rabobank</span></SelectItem>
                    <SelectItem value="bbva"><span className="flex items-center gap-2"><BankLogo bank="bbva" size={18} /> BBVA</span></SelectItem>
                    <SelectItem value="santander"><span className="flex items-center gap-2"><BankLogo bank="santander" size={18} /> Santander</span></SelectItem>
                    <SelectItem value="caixabank"><span className="flex items-center gap-2"><BankLogo bank="caixabank" size={18} /> CaixaBank</span></SelectItem>
                    <SelectItem value="generic">{t("genericFormat")}</SelectItem>
                  </SelectContent>
                </Select>
                {format && (
                  <Badge variant="secondary">{FORMAT_LABELS[format] ?? format}</Badge>
                )}
              </div>
            ) : fileType === "excel" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Excel</Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("autoDetectBank")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {["bbva", "santander", "caixabank", "ing", "revolut", "n26", "wise"].map((b) => (
                    <BankLogo key={b} bank={b} size={20} />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1">{t("andMore")}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t("bankPdf")}</Badge>
                <span className="text-xs text-muted-foreground">
                  {t("bankPdfDesc")}
                </span>
              </div>
            )}

            {/* Account selector */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("targetAccountLabel")}</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {accounts.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => { setTargetAccount(a.slug); setCreatingAccount(false); }}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2 shrink-0 ${
                      targetAccount === a.slug && !creatingAccount
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: a.color || "var(--muted-foreground)" }}
                    />
                    {a.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setCreatingAccount(true); setTargetAccount(""); }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border border-dashed flex items-center gap-1.5 shrink-0 ${
                    creatingAccount
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  <Plus size={14} />
                  {t("newAccountButton")}
                </button>
              </div>
              {creatingAccount && (
                <div className="flex gap-2 items-end">
                  <Input
                    placeholder={t("accountNamePlaceholder")}
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!newAccountName.trim()}
                    onClick={async () => {
                      const slug = newAccountName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                      const res = await apiFetch("/api/accounts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slug, name: newAccountName.trim(), emoji: "" }),
                      });
                      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("accountCreateError")); return; }
                      setTargetAccount(slug);
                      setCreatingAccount(false);
                      setNewAccountName("");
                      refreshAccounts();
                    }}
                  >
                    {t("createButton")}
                  </Button>
                </div>
              )}
            </div>

            {/* Import options */}
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("importOptions")}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{t("freshImportLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("freshImportDesc")}
                  </p>
                </div>
                <Switch
                  checked={freshImport}
                  onCheckedChange={(v) => {
                    setFreshImport(v);
                    if (v) setSkipDuplicates(false);
                  }}
                />
              </div>
              {!freshImport && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">{t("skipDuplicatesLabel")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("skipDuplicatesDesc")}
                    </p>
                  </div>
                  <Switch
                    checked={skipDuplicates}
                    onCheckedChange={setSkipDuplicates}
                  />
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handlePreview} disabled={loading || (!format && fileType === "csv" && !excelBase64)}>
              {loading ? t("analyzingBtn") : t("analyzeFile")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading — overlay with staged progress */}
      {loading && !preview && loadingStartedAt && (
        <ImportProgressOverlay
          open
          mode="preview"
          startedAt={loadingStartedAt}
          fileName={fileName || undefined}
        />
      )}

      {/* Preview table */}
      {preview && (
        <>
          {/* Auto-detection info */}
          {format === "generic (auto)" && preview.transactions.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-3 flex items-start gap-3">
                <Search size={18} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{t("formatAutoDetected")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("formatAutoDetectedDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warnings (consistency check, balance mismatch, etc.) vs row-level problems */}
          {(() => {
            const warnings = preview.errors.filter((e) => /^AVISO/i.test(e));
            const problems = preview.errors.filter((e) => !/^AVISO/i.test(e));
            return (
              <>
                {warnings.length > 0 && (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="pt-4 pb-3 flex items-start gap-3">
                      <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-600">
                          {t("importPreviewWarningTitle") || "Aviso al revisar"}
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {warnings.map((w, i) => (
                            <p key={i}>{w.replace(/^AVISO:\s*/i, "")}</p>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {t("importPreviewWarningHint") || "Las transacciones se importarán igual — revisa que no falte ninguna antes de confirmar."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {problems.length > 0 && (
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardContent className="pt-4 pb-3 flex items-start gap-3">
                      <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive">
                          {problems.length} {t("rowsWithProblems")}
                        </p>
                        <div className="max-h-24 overflow-y-auto text-xs text-muted-foreground space-y-0.5 mt-1">
                          {problems.slice(0, 5).map((err, i) => (
                            <p key={i}>{err}</p>
                          ))}
                          {problems.length > 5 && (
                            <p>...y {problems.length - 5} mas</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}

          {/* Balance input */}
          <Card className={balanceDetected ? "border-income/30 bg-income/5" : "border-primary/30 bg-primary/5"}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-3">
                {balanceDetected ? (
                  <CheckCircle2 size={18} className="text-income shrink-0 mt-0.5" />
                ) : (
                  <Info size={18} className="text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium">
                      {balanceDetected
                        ? t("balanceDetected")
                        : t("balanceNotDetected")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {balanceDetected
                        ? t("balanceDetectedDesc")
                        : t("balanceNotDetectedDesc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative max-w-[240px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">€</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={userBalance}
                        onChange={(e) => {
                          // Allow only numbers, dots, commas, minus
                          const v = e.target.value.replace(/[^0-9.,-]/g, "");
                          setUserBalance(v);
                          if (balanceDetected) setBalanceDetected(false);
                        }}
                        className="pl-8 text-lg font-semibold tracking-tight"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {preview.summary.internal > 0 && (
            <Card>
              <CardContent className="pt-4 pb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("internalMovements")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {preview.summary.internal} {t("internalMovementsDesc")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="include-internal" className="text-sm text-muted-foreground">
                    {t("includeAsTransfers")}
                  </label>
                  <Switch
                    id="include-internal"
                    checked={includeInternal}
                    onCheckedChange={setIncludeInternal}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-2">
              <CardTitle className="text-base sm:text-lg">{t("previewLabel")} ({preview.transactions.length})</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetAll}
                >
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={loading || importCount === 0}
                  className="h-9"
                >
                  {loading ? t("importingTransactions") : `${t("importCount")} ${importCount}`}
                </Button>
              </div>
            </CardHeader>
            {loading && loadingStartedAt && loadingMode === "import" && (
              <CardContent className="pt-0">
                <ImportProgressOverlay
                  open
                  mode="import"
                  startedAt={loadingStartedAt}
                  fileName={fileName || undefined}
                  txCount={importCount}
                />
              </CardContent>
            )}
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={
                            selected.size ===
                            preview.transactions.filter((t) => !t.isDuplicate).length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected(
                                new Set(
                                  preview.transactions
                                    .map((_, i) => i)
                                    .filter((i) => !preview.transactions[i].isDuplicate)
                                )
                              );
                            } else {
                              setSelected(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>{t("tableDate")}</TableHead>
                      <TableHead>{t("tableDescription2")}</TableHead>
                      <TableHead className="text-right">{t("tableAmount")}</TableHead>
                      <TableHead>{t("tableCategory")}</TableHead>
                      <TableHead>{t("tableStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.transactions.map((item, i) => (
                      <TableRow
                        key={i}
                        className={
                          item.isDuplicate
                            ? "bg-amber-50 dark:bg-amber-950/20 opacity-60"
                            : ""
                        }
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selected.has(i) && !item.isDuplicate}
                            disabled={item.isDuplicate}
                            onChange={() => !item.isDuplicate && toggleSelect(i)}
                          />
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {item.transaction.date}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {item.transaction.description || (
                            <span className="text-muted-foreground italic">{t("noDescription")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          <span
                            className={
                              item.transaction.direction === "income"
                                ? "text-income"
                                : "text-foreground"
                            }
                          >
                            {item.transaction.direction === "income" ? "+" : "-"}
                            {item.transaction.amount.toFixed(2)}{" "}
                            {item.transaction.currency}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.category ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <CategoryIcon icon={getCategoryInfo(item.category).icon} color={getCategoryInfo(item.category).color} size="sm" withBackground={false} />{" "}
                                {getCategoryInfo(item.category).label}
                              </Badge>
                              {item.ai_categorized && (
                                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary px-1">
                                  IA
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("summaryUncategorized")}</span>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {item.isDuplicate ? (
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-400 text-amber-600 dark:text-amber-400"
                            >
                              {t("duplicateLabel")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-green-400 text-green-600 dark:text-green-400">
                              {t("newLabel")}
                            </Badge>
                          )}
                          {item.transaction.is_internal && (
                            <Badge
                              variant="outline"
                              className="text-xs border-primary text-primary"
                            >
                              {t("internalLabel")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Import result */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t("importCompleted")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-center">
                <CheckCircle2 size={20} className="text-green-600 dark:text-green-400 mx-auto mb-1" />
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {importResult.imported}
                </p>
                <p className="text-sm text-muted-foreground">{t("importedLabel")}</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {importResult.skipped}
                </p>
                <p className="text-sm text-muted-foreground">{t("skippedLabel")}</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <Info size={20} className="text-muted-foreground mx-auto mb-1" />
                <p className="text-3xl font-bold text-muted-foreground">
                  {importResult.uncategorized}
                </p>
                <p className="text-sm text-muted-foreground">{t("uncategorizedLabel")}</p>
              </div>
            </div>

            {importResult.uncategorized > 0 && (
              <p className="text-sm text-muted-foreground">
                {importResult.uncategorized} {t("uncategorizedHint")}{" "}
                <a href="/rules" className="text-primary underline">
                  {t("categorizationRules")}
                </a>{" "}
                {t("uncategorizedHintEnd")}
              </p>
            )}

            <div className="flex gap-2">
              <Button asChild>
                <Link href="/transactions">{t("viewTransactions")}</Link>
              </Button>
              <Button variant="outline" onClick={resetAll}>
                {t("importAnother")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive mb-1">
                  {t("importErrorTitle") || "No pudimos analizar el archivo"}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed break-words">
                  {error}
                </p>
                {hasFile && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {reportSent ? (
                      <p className="text-xs text-[#2D6A4F] font-medium flex items-center gap-1.5">
                        <CheckCircle2 size={14} />
                        {t("importReportSent") || "Reporte enviado — lo revisaremos"}
                      </p>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        onClick={() => setShowReportModal(true)}
                        disabled={reportSending}
                      >
                        <Bug size={14} />
                        {t("importReportError") || "Reportar error"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showReportModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center animate-in"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={() => !reportSending && setShowReportModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border border-border shadow-2xl p-6 animate-[slideInUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2D6A4F]/10 flex items-center justify-center">
                  <Bug className="text-[#2D6A4F]" size={20} strokeWidth={2} />
                </div>
                <p className="text-base font-bold">
                  {t("importReportModalTitle") || "Reportar este error"}
                </p>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                disabled={reportSending}
                className="p-1 -m-1 text-muted-foreground"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {t("importReportModalBody")
                || "Nos envías el archivo y el error para que lo diagnostiquemos. Usamos el archivo solo para arreglar el problema y lo borramos al resolverlo."}
            </p>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("importReportNotesLabel") || "Notas opcionales"}
            </label>
            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value.slice(0, 2000))}
              placeholder={
                t("importReportNotesPlaceholder")
                || "¿Qué banco es? ¿Qué esperabas ver? Cualquier detalle ayuda..."
              }
              rows={4}
              disabled={reportSending}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/40"
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-2xl"
                onClick={() => setShowReportModal(false)}
                disabled={reportSending}
              >
                {t("cancel") || "Cancelar"}
              </Button>
              <Button
                className="flex-1 h-11 rounded-2xl gap-2"
                onClick={sendErrorReport}
                disabled={reportSending}
              >
                {reportSending ? (
                  <>{t("sending") || "Enviando..."}</>
                ) : (
                  <>
                    <Send size={16} />
                    {t("send") || "Enviar"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPrivacyConsent && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center animate-in"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        >
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border border-border shadow-2xl p-6 animate-[slideInUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#2D6A4F]/10 flex items-center justify-center">
                <ShieldCheck className="text-[#2D6A4F]" size={28} strokeWidth={2} />
              </div>
              <div>
                <p className="text-base font-bold mb-1">{t("importPrivacyTitle")}</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[340px]">
                  {t("importPrivacyBody")}
                </p>
              </div>
              <Link href="/privacy" className="text-xs text-[#2D6A4F] font-medium underline underline-offset-2">
                {t("importPrivacyReadMore")}
              </Link>
              <Button
                className="w-full h-12 rounded-2xl"
                onClick={() => {
                  try { localStorage.setItem("fintrk-import-privacy-seen", "1"); } catch { /* ignore */ }
                  setShowPrivacyConsent(false);
                }}
              >
                {t("importPrivacyContinue")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
