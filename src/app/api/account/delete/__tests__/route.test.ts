import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return {
    headers: h,
    json: async () => body,
  } as unknown as NextRequest;
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("devuelve 401 si no hay auth", async () => {
    vi.doMock("@/lib/get-user-id", () => ({
      getUserId: vi.fn().mockRejectedValue(new Error("no auth")),
    }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ confirmation: "BORRAR MI CUENTA" }));
    expect(res.status).toBe(401);
  });

  it("devuelve 400 si confirmation falta o no coincide", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(42) }));
    vi.doMock("@/lib/db", () => ({ sql: vi.fn() }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("happy path borra best-effort tables + users cascade", async () => {
    const sqlMock = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(42) }));
    vi.doMock("@/lib/db", () => ({ sql: sqlMock }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ confirmation: "BORRAR MI CUENTA" }));
    expect(res.status).toBe(200);
    // Debe haber borrado: best-effort tables + users.
    const sqlCalls = sqlMock.mock.calls.map((c) => c[0] as string);
    expect(sqlCalls.some((s) => /DELETE FROM push_log/i.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /DELETE FROM import_error_reports/i.test(s))).toBe(true);
    expect(sqlCalls.some((s) => /DELETE FROM users WHERE id = \$1/i.test(s))).toBe(true);
  });
});
