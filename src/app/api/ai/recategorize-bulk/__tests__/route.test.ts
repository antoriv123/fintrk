import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

describe("POST /api/ai/recategorize-bulk", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it("devuelve 401 sin auth", async () => {
    vi.doMock("@/lib/get-user-id", () => ({
      getUserId: vi.fn().mockRejectedValue(new Error("no auth")),
    }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("@/lib/ai", () => ({ categorizeTransactions: vi.fn() }));
    vi.doMock("@/lib/auto-categorize", () => ({ suggestCategory: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("devuelve 503 sin OPENAI_API_KEY", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("@/lib/ai", () => ({ categorizeTransactions: vi.fn() }));
    vi.doMock("@/lib/auto-categorize", () => ({ suggestCategory: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("IA");
  });

  it("apply con [] devuelve 0 updated sin tocar OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    const sqlMock = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/db", () => ({ sql: sqlMock }));
    const catMock = vi.fn();
    vi.doMock("@/lib/ai", () => ({ categorizeTransactions: catMock }));
    vi.doMock("@/lib/auto-categorize", () => ({ suggestCategory: vi.fn(() => null) }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ apply: [] }));
    // Lista vacia -> pasa al flujo normal con rows=[] y devuelve 0.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toBe(0);
    // La IA no se invoca si no hay rows.
    expect(catMock).not.toHaveBeenCalled();
  });
});
