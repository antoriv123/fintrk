import { NextRequest, NextResponse } from "next/server";
import { parseCSV, type ParseResult } from "@/lib/csv-parser";
import { parseBankPDF } from "@/lib/pdf-parser";
import { parseExcel } from "@/lib/excel-parser";
import { checkDuplicates } from "@/lib/duplicate-detector";
import { applyRules } from "@/lib/rules-engine";
import { categorizeTransactions } from "@/lib/ai";
import { sql, withTransaction } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { clearDemoTransactions } from "@/lib/demo-data";
import { decideEscalation, pickBestResult } from "@/lib/import-escalation";
import { detectStandardFormat, parseStandardFormat } from "@/lib/standard-parsers";
import { recordImportEvent, normaliseBankFromFormat } from "@/lib/import-telemetry";

// Allow maximum serverless execution time (60s Hobby, 300s Pro)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  // Telemetry captured as we go — flushed at every return path below.
  const telemetry = {
    aiEscalated: false,
    aiReason: null as string | null,
    consistencyOk: null as boolean | null,
  };
  try {
    const userId = await getUserId();
    const body = await req.json();
    const {
      csvText,
      pdfBase64,
      excelBase64,
      pageImages,
      format,
      mapping,
      action = "preview",
      includeInternal = false,
      skipDuplicateCheck = false,
      clearAccount,
      targetAccount,
      userBalance,
    } = body as {
      csvText?: string;
      pdfBase64?: string;
      excelBase64?: string;
      pageImages?: string[];
      format?: string;
      mapping?: { date: number; description: number; amount: number; currency?: number };
      action: "preview" | "import";
      includeInternal?: boolean;
      skipDuplicateCheck?: boolean;
      clearAccount?: string;
      targetAccount?: string;
      userBalance?: number;
    };

    if (!csvText && !pdfBase64 && !excelBase64) {
      return NextResponse.json({ error: "Sube un archivo CSV, PDF o Excel para importar." }, { status: 400 });
    }

    // Log payload size for monitoring (Vercel enforces its own body limits)
    const imagesSize = pageImages ? pageImages.reduce((sum, img) => sum + img.length, 0) : 0;
    const payloadSize = (pdfBase64?.length ?? 0) + (excelBase64?.length ?? 0) + (csvText?.length ?? 0) + imagesSize;
    console.log(`[import] Payload size: ${(payloadSize / 1024).toFixed(0)}KB (images: ${(imagesSize / 1024).toFixed(0)}KB)`);

    // Parse CSV, PDF or Excel
    let parseResult: ParseResult | null = null;
    let parseErrorMsg = "";
    const fileType = excelBase64 ? "excel" : pdfBase64 ? "pdf" : "csv";
    console.log(`[import] Processing file: type=${fileType}, format=${format}, hasOpenAI=${!!process.env.OPENAI_API_KEY}, v=3`);
    try {
      if (excelBase64) {
        const buffer = Buffer.from(excelBase64, "base64");
        // Magic bytes: XLSX = ZIP (PK\x03\x04), XLS = OLE2 (D0CF11E0A1B11AE1).
        // Rechazamos cualquier otro contenido para reducir superficie de
        // ataque sobre xlsx (3 vulns HIGH sin fix, ver auditoria 2026-04-23).
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
        const isOLE = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
        if (!isZip && !isOLE) {
          return NextResponse.json({ error: "El archivo no parece un Excel válido" }, { status: 400 });
        }
        console.log(`[import] Excel buffer size: ${buffer.length} bytes`);
        parseResult = parseExcel(buffer);
        console.log(`[import] Excel parse result: ${parseResult.transactions.length} transactions, format=${parseResult.format}`);
      } else if (pdfBase64) {
        const buffer = Buffer.from(pdfBase64, "base64");
        // Magic bytes: "%PDF" (25 50 44 46). Rechazamos payloads arbitrarios
        // antes de pasar a parseBankPDF — defensa contra ataques al parser.
        const isPDF = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        if (!isPDF) {
          return NextResponse.json({ error: "El archivo no parece un PDF válido" }, { status: 400 });
        }
        console.log(`[import] PDF buffer size: ${buffer.length} bytes`);
        parseResult = await parseBankPDF(buffer);
        console.log(`[import] PDF parse result: ${parseResult.transactions.length} transactions, format=${parseResult.format}`);
      } else if (csvText) {
        // Before regular CSV parsing, sniff for open banking formats (OFX/QIF/CAMT.053/MT940).
        // These are cross-bank standards — we parse them without any AI or bank-specific code.
        const standardFormat = detectStandardFormat(csvText);
        if (standardFormat) {
          console.log(`[import] Detected standard format: ${standardFormat}`);
          parseResult = parseStandardFormat(csvText, standardFormat);
          console.log(`[import] ${standardFormat} parse result: ${parseResult.transactions.length} transactions`);
        } else if (format === "generic" && mapping) {
          parseResult = (await import("@/lib/csv-parser")).parseGeneric(csvText, mapping);
        } else {
          parseResult = parseCSV(csvText, format);
        }
      }
    } catch (parseError) {
      // No loguear el mensaje completo — parsers bancarios incluyen a veces
      // fragmentos de filas en los errores. Vercel logs son accesibles a
      // cualquier colaborador. Con DEBUG_IMPORT=1 se incluye el detalle.
      const errName = parseError instanceof Error ? parseError.constructor.name : "Error";
      if (process.env.DEBUG_IMPORT === "1") {
        console.error("[import] Parse error (will try AI fallback):", parseError);
      } else {
        console.error(`[import] Parse error (will try AI fallback): ${errName}`);
      }
      parseErrorMsg = parseError instanceof Error ? parseError.message : "formato no reconocido";
      // Don't return yet — try AI fallback below
    }

    // ── AI fallback router ──
    // decideEscalation() / pickBestResult() are pure and unit-tested in
    // src/lib/__tests__/import-escalation.test.ts
    const bufferSize = (pdfBase64?.length ?? 0) + (excelBase64?.length ?? 0);
    const textSize = csvText?.length ?? 0;
    const decision = decideEscalation({
      parseResult,
      hasAIKey: !!process.env.OPENAI_API_KEY,
      bufferSize,
      textSize,
      pageImageCount: pageImages?.length ?? 0,
    });

    if (decision.escalate) {
      telemetry.aiEscalated = true;
      telemetry.aiReason = decision.reason;
      const structuredTxCount = parseResult?.transactions.length ?? 0;
      const context = !parseResult ? `parser crashed: ${parseErrorMsg}`
        : `format=${parseResult.format}, structuredTx=${structuredTxCount}, weak=${parseResult.weakDetection === true}`;
      console.log(`[import] Escalating to AI fallback — reason=${decision.reason}, ${context}`);

      const structuredResult = parseResult;
      let aiResult: ParseResult | null = null;

      // Step 1: Vision AI (most accurate for PDFs, when page images are available)
      if (pageImages && pageImages.length > 0) {
        try {
          console.log(`[import] Vision AI: ${pageImages.length} page images`);
          const { parseWithVision } = await import("@/lib/ai-pdf-vision");
          const visionResult = await parseWithVision(pageImages);
          if (visionResult.transactions.length > 0) {
            console.log(`[import] Vision AI extracted ${visionResult.transactions.length} transactions`);
            aiResult = visionResult;
          }
        } catch (visionErr) {
          console.error(`[import] Vision AI failed: ${visionErr instanceof Error ? visionErr.constructor.name : "Error"}`);
        }
      }

      // Step 2: Text-based AI if vision didn't run / didn't extract more than structured
      if (!aiResult || aiResult.transactions.length <= structuredTxCount) {
        try {
          const { parseWithAI } = await import("@/lib/ai-import");
          let rawContent = "";
          if (csvText) {
            rawContent = csvText;
          } else if (excelBase64) {
            const XLSX = await import("xlsx");
            const buffer = Buffer.from(excelBase64, "base64");
            const wb = XLSX.read(buffer, { type: "buffer" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rawContent = ws ? XLSX.utils.sheet_to_csv(ws) : "";
          } else if (pdfBase64) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const pdfParse = require("pdf-parse/lib/pdf-parse.js");
              const buffer = Buffer.from(pdfBase64, "base64");
              const data = await pdfParse(buffer);
              rawContent = data.text ?? "";
            } catch { rawContent = ""; }
          }

          if (rawContent.trim().length > 0) {
            const detectedFormat = structuredResult?.format ?? format ?? fileType;
            const textAIResult = await parseWithAI(rawContent, detectedFormat);
            if (textAIResult.transactions.length > (aiResult?.transactions.length ?? 0)) {
              console.log(`[import] Text AI extracted ${textAIResult.transactions.length} transactions`);
              aiResult = textAIResult;
            }
          }
        } catch (aiErr) {
          console.error(`[import] Text AI failed: ${aiErr instanceof Error ? aiErr.constructor.name : "Error"}`);
        }
      }

      // Pick the best of structured vs AI (more transactions wins).
      parseResult = pickBestResult(structuredResult, aiResult);
    }

    // Telemetry helper — fire-and-forget, swallows its own errors.
    const track = (opts: { txCount: number; errorMsg: string | null }) => {
      const fmt = parseResult?.format ?? "crashed";
      void recordImportEvent({
        userId: Number(userId),
        action: action === "import" ? "import" : "preview",
        fileType,
        fileSizeBytes: bufferSize,
        pageCount: pageImages?.length ?? 0,
        detectedFormat: fmt,
        detectedBank: normaliseBankFromFormat(fmt),
        txCount: opts.txCount,
        weakDetection: parseResult?.weakDetection === true,
        aiEscalated: telemetry.aiEscalated,
        aiReason: telemetry.aiReason,
        consistencyOk: telemetry.consistencyOk,
        durationMs: Date.now() - startedAt,
        error: opts.errorMsg,
      });
    };

    // If both structured parser and AI failed completely
    if (!parseResult) {
      track({ txCount: 0, errorMsg: parseErrorMsg || "parser crashed" });
      return NextResponse.json({
        error: `Error al analizar el archivo: ${parseErrorMsg}. Intenta con otro formato (CSV en vez de Excel, o viceversa).`,
        debug: { fileType, format },
      }, { status: 400 });
    }

    // If still 0 transactions after all attempts
    if (parseResult.transactions.length === 0 && parseResult.errors.length > 0) {
      track({ txCount: 0, errorMsg: parseResult.errors[0] });
      return NextResponse.json({
        error: `No se encontraron transacciones: ${parseResult.errors[0]}`,
        errors: parseResult.errors,
        format: parseResult.format,
        _v: 2,
      }, { status: 400 });
    }

    if (parseResult.transactions.length === 0) {
      track({ txCount: 0, errorMsg: "0 tx, no errors" });
      return NextResponse.json({
        error: "No se encontraron transacciones en el archivo. Verifica que el archivo contiene datos bancarios.",
        format: parseResult.format,
        debug: { bufferSize: pdfBase64?.length ?? 0, fileType: excelBase64 ? "excel" : pdfBase64 ? "pdf" : "csv" },
        _v: 2,
      }, { status: 400 });
    }

    // Check consistency by looking for AVISO: markers added by vision/consistency check
    if (parseResult.errors.some((e) => /^AVISO/i.test(e))) {
      telemetry.consistencyOk = false;
    } else if (parseResult.format === "vision") {
      telemetry.consistencyOk = true;
    }

    // Override account if user selected a target account
    if (targetAccount) {
      for (const tx of parseResult.transactions) {
        tx.account = targetAccount;
      }
      // Also remap finalBalances keys if they exist
      if (parseResult.finalBalances) {
        const oldBalances = parseResult.finalBalances;
        const values = Object.values(oldBalances);
        if (values.length === 1) {
          parseResult.finalBalances = { [targetAccount]: values[0] };
        }
      }
    }

    // Check duplicates (or skip if user requested)
    const withDuplicates = skipDuplicateCheck
      ? parseResult.transactions.map((tx) => ({ transaction: tx, isDuplicate: false }))
      : await checkDuplicates(parseResult.transactions, userId);

    // Apply rules to categorize (in batches of 50 to avoid DB connection saturation)
    const withCategories: Array<typeof withDuplicates[0] & { category: string | null; expense_type: string | null }> = [];
    const RULE_BATCH = 50;
    for (let i = 0; i < withDuplicates.length; i += RULE_BATCH) {
      const batch = withDuplicates.slice(i, i + RULE_BATCH);
      const results = await Promise.all(batch.map(async (item) => {
        const ruled = await applyRules(item.transaction.description, item.transaction.account ?? null, userId);
        return {
          ...item,
          category: ruled?.category ?? null,
          expense_type: ruled?.expense_type ?? null,
        };
      }));
      withCategories.push(...results);
    }

    // AI categorization for uncategorized, non-duplicate transactions
    // Skip during preview if there are many transactions (saves time + avoids timeout)
    const uncategorized = withCategories.filter(
      (t) => !t.category && !t.isDuplicate && !t.transaction.is_internal
    );

    const shouldAICategorize = uncategorized.length > 0
      && process.env.OPENAI_API_KEY
      && (action === "import" || uncategorized.length <= 100);

    if (shouldAICategorize) {
      try {
        console.log(`[import] AI categorizing ${uncategorized.length} transactions (action=${action})`);
        const aiResults = await categorizeTransactions(
          uncategorized.map((t) => ({
            description: t.transaction.description,
            amount: t.transaction.amount,
            currency: t.transaction.currency,
            date: t.transaction.date,
            direction: t.transaction.direction,
            account: t.transaction.account,
          }))
        );

        // Merge AI results back
        let aiIdx = 0;
        for (const item of withCategories) {
          if (!item.category && !item.isDuplicate && !item.transaction.is_internal) {
            const ai = aiResults[aiIdx++];
            if (ai) {
              item.category = ai.category;
              item.expense_type = ai.expense_type;
              (item as Record<string, unknown>).ai_categorized = true;
              (item as Record<string, unknown>).ai_confidence = ai.confidence;
            }
          }
        }
      } catch (aiError) {
        console.error("[import] AI categorization failed:", aiError);
        // Continue without AI — transactions stay uncategorized but import still works
      }
    } else if (uncategorized.length > 100 && action === "preview") {
      console.log(`[import] Skipping AI categorization for preview (${uncategorized.length} uncategorized — too many)`);
    }

    if (action === "preview") {
      track({ txCount: withCategories.length, errorMsg: null });
      return NextResponse.json({
        format: parseResult.format,
        errors: parseResult.errors,
        transactions: withCategories,
        finalBalances: parseResult.finalBalances ?? null,
        summary: {
          total: withCategories.length,
          duplicates: withCategories.filter((t) => t.isDuplicate).length,
          new: withCategories.filter((t) => !t.isDuplicate).length,
          uncategorized: withCategories.filter((t) => !t.category && !t.isDuplicate).length,
          ai_categorized: withCategories.filter((t) => (t as Record<string, unknown>).ai_categorized).length,
          internal: withCategories.filter((t) => t.transaction.is_internal).length,
        },
      });
    }

    // action === "import"

    // Fresh import always includes internal movements (needed for correct balances)
    const effectiveIncludeInternal = includeInternal || !!clearAccount;

    // Collect transactions to import (BEFORE el DELETE, para no borrar
    // histórico si hay un fallo en la preparación de datos posterior).
    const toImport: Array<{ tx: typeof withCategories[0]["transaction"]; category: string; expense_type: string | null }> = [];
    let skipped = 0;

    for (const item of withCategories) {
      if (item.isDuplicate) { skipped++; continue; }
      if (item.transaction.is_internal && !effectiveIncludeInternal) { skipped++; continue; }
      const category = item.transaction.is_internal
        ? "transferencia"
        : (item.category ?? "otros");
      toImport.push({ tx: item.transaction, category, expense_type: item.expense_type ?? null });
    }

    // Clear demo transactions before importing real ones (best-effort).
    try { await clearDemoTransactions(Number(userId)); } catch {}

    // Batch insert + clearAccount envueltos en transaccion SQL.
    // Si cualquier INSERT batch falla, se hace ROLLBACK y el usuario conserva
    // sus datos historicos intactos — antes el DELETE ya habia ocurrido y
    // el fallo a mitad del batch dejaba al user sin nada.
    const INSERT_BATCH = 50;
    let imported = 0;
    await withTransaction(async (q) => {
      if (clearAccount) {
        const accounts = new Set(parseResult.transactions.map((t) => t.account ?? clearAccount));
        for (const acct of accounts) {
          await q("DELETE FROM transactions WHERE account = $1 AND user_id = $2", [acct, userId]);
        }
      }
      for (let i = 0; i < toImport.length; i += INSERT_BATCH) {
        const batch = toImport.slice(i, i + INSERT_BATCH);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        batch.forEach(({ tx, category, expense_type }, j) => {
          const offset = j * 10;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, NOW(), NOW())`);
          values.push(userId, tx.amount, tx.currency, tx.amount, tx.direction, tx.description, category, expense_type, tx.date, tx.account ?? null);
        });
        await q(
          `INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, account, created_at, updated_at)
           VALUES ${placeholders.join(", ")}`,
          values
        );
        imported += batch.length;
      }
    });

    // If user provided a balance manually, use it as finalBalances
    // Otherwise use what the parser detected from the bank statement
    const detectedBalances = parseResult.finalBalances;
    const accountSlug = targetAccount || parseResult.transactions[0]?.account || clearAccount;
    const finalBalances = userBalance !== undefined && accountSlug
      ? { [accountSlug]: userBalance }
      : detectedBalances;

    // Ensure accounts exist and set balance to match the real bank balance
    if (finalBalances && (clearAccount || userBalance !== undefined)) {
      const ACCOUNT_NAMES: Record<string, { name: string; emoji: string }> = {
        revolut: { name: "Revolut", emoji: "💳" },
        "revolut-ahorros": { name: "Revolut Ahorros", emoji: "🏦" },
        "revolut-pockets": { name: "Revolut Pockets", emoji: "📦" },
        ing: { name: "ING", emoji: "🟠" },
        bbva: { name: "BBVA", emoji: "🏦" },
        santander: { name: "Santander", emoji: "🔴" },
        caixabank: { name: "CaixaBank", emoji: "🏦" },
        n26: { name: "N26", emoji: "💳" },
        wise: { name: "Wise", emoji: "💚" },
        myinvestor: { name: "MyInvestor", emoji: "📈" },
      };

      for (const [slug, realBalance] of Object.entries(finalBalances)) {
        const info = ACCOUNT_NAMES[slug] ?? { name: slug, emoji: "💰" };
        // Upsert: create if not exists, activate if exists (race-condition safe)
        await sql(
          `INSERT INTO accounts (user_id, slug, name, emoji, initial_balance, currency, color, is_active)
           VALUES ($1, $2, $3, $4, 0, 'EUR', '#3b82f6', 1)
           ON CONFLICT (user_id, slug) DO UPDATE SET is_active = 1`,
          [userId, slug, info.name, info.emoji]
        );

        // Calculate what our transactions add up to for this account
        const incomeSumRows = await sql(
          "SELECT COALESCE(SUM(eur_amount), 0) as t FROM transactions WHERE account = $1 AND user_id = $2 AND direction = 'income'",
          [slug, userId]
        );
        const incomeSum = (incomeSumRows[0] as { t: number }).t;

        const expenseSumRows = await sql(
          "SELECT COALESCE(SUM(eur_amount), 0) as t FROM transactions WHERE account = $1 AND user_id = $2 AND direction = 'expense'",
          [slug, userId]
        );
        const expenseSum = (expenseSumRows[0] as { t: number }).t;

        const calculatedBalance = incomeSum - expenseSum;

        // Set initial_balance to compensate for any difference
        // So that: initial_balance + income - expense = realBalance
        const correction = realBalance - calculatedBalance;
        await sql(
          "UPDATE accounts SET initial_balance = $1 WHERE slug = $2 AND user_id = $3",
          [Math.round(correction * 100) / 100, slug, userId]
        );
      }
    }

    track({ txCount: imported, errorMsg: null });
    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: parseResult.errors,
      uncategorized: withCategories.filter(
        (t) => !t.isDuplicate && !t.category
      ).length,
      finalBalances: finalBalances ?? null,
    });
  } catch (error) {
    console.error("[import] Unhandled error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    // Best-effort telemetry — userId may not exist if getUserId() threw.
    try {
      void recordImportEvent({
        userId: 0,
        action: "preview",
        fileType: "unknown",
        fileSizeBytes: 0,
        pageCount: 0,
        detectedFormat: "crashed",
        detectedBank: "unknown",
        txCount: 0,
        weakDetection: false,
        aiEscalated: telemetry.aiEscalated,
        aiReason: telemetry.aiReason,
        consistencyOk: telemetry.consistencyOk,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    } catch { /* swallow */ }
    return NextResponse.json(
      { error: `Error al importar: ${message}. Si el problema persiste, intenta con formato CSV.` },
      { status: 500 }
    );
  }
}
