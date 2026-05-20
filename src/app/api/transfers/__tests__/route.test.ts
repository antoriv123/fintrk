import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/transfers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("rechaza 400 si faltan campos", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("@/lib/demo-data", () => ({ clearDemoTransactions: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ amount: 10 }));
    expect(res.status).toBe(400);
  });

  it("rechaza 400 si from_account === to_account", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("@/lib/demo-data", () => ({ clearDemoTransactions: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ amount: 10, from_account: "revolut", to_account: "revolut", date: "2026-04-23" }));
    expect(res.status).toBe(400);
  });

  it("happy path pasa user_id en el INSERT CTE", async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ transfer_id: 99, updated_count: 2 }]);
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(42) }));
    vi.doMock("@/lib/db", () => ({ sql: sqlMock }));
    vi.doMock("@/lib/demo-data", () => ({ clearDemoTransactions: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({
      amount: 100, currency: "EUR",
      from_account: "revolut", to_account: "bbva",
      date: "2026-04-23", description: "Test", notes: "note",
    }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.id).toBe(99);
    // user_id es el primer parametro ($1) tanto en from_tx como en to_tx y tr.
    expect(sqlMock).toHaveBeenCalledOnce();
    const [sqlText, params] = sqlMock.mock.calls[0];
    expect(sqlText).toContain("WITH from_tx");
    expect(sqlText).toContain("INSERT INTO transfers (from_transaction_id, to_transaction_id, user_id");
    expect(params?.[0]).toBe(42); // userId
    expect(params?.[5]).toBe("revolut"); // from_account
    expect(params?.[6]).toBe("bbva"); // to_account
  });
});
