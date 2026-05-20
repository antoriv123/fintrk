import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("POST /api/import — magic bytes validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  async function setupMocks() {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn(), withTransaction: vi.fn() }));
    vi.doMock("@/lib/demo-data", () => ({ clearDemoTransactions: vi.fn() }));
    vi.doMock("@/lib/csv-parser", () => ({ parseCSV: vi.fn() }));
    vi.doMock("@/lib/pdf-parser", () => ({ parseBankPDF: vi.fn() }));
    vi.doMock("@/lib/excel-parser", () => ({ parseExcel: vi.fn() }));
    vi.doMock("@/lib/duplicate-detector", () => ({ checkDuplicates: vi.fn() }));
    vi.doMock("@/lib/rules-engine", () => ({ applyRules: vi.fn() }));
    vi.doMock("@/lib/ai", () => ({ categorizeTransactions: vi.fn() }));
    vi.doMock("@/lib/import-escalation", () => ({ decideEscalation: vi.fn(), pickBestResult: vi.fn() }));
    vi.doMock("@/lib/standard-parsers", () => ({ detectStandardFormat: vi.fn(), parseStandardFormat: vi.fn() }));
    vi.doMock("@/lib/import-telemetry", () => ({ recordImportEvent: vi.fn(), normaliseBankFromFormat: vi.fn() }));
  }

  it("rechaza PDF con magic bytes inválidos", async () => {
    await setupMocks();
    const { POST } = await import("../route");
    // "NOT A PDF" en base64
    const invalidPdf = Buffer.from("NOT A PDF at all").toString("base64");
    const res = await POST(makeReq({ pdfBase64: invalidPdf }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/PDF/i);
  });

  it("rechaza Excel con magic bytes inválidos", async () => {
    await setupMocks();
    const { POST } = await import("../route");
    const invalidExcel = Buffer.from("random binary garbage").toString("base64");
    const res = await POST(makeReq({ excelBase64: invalidExcel }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Excel/i);
  });

  it("acepta PDF con magic bytes correctos (%PDF)", async () => {
    await setupMocks();
    const { POST } = await import("../route");
    // Start with "%PDF-1.4" bytes
    const validPdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]).toString("base64");
    const res = await POST(makeReq({ pdfBase64: validPdfHeader }));
    // No es 400 de magic bytes — puede fallar en otro paso pero no en la validación inicial
    expect(res.status).not.toBe(400);
  });
});
