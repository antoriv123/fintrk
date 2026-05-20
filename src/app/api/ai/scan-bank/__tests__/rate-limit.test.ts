import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("POST /api/ai/scan-bank — rate limit + magic bytes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("devuelve 429 cuando el rate limit bloquea", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/ai-rate-limit", () => ({
      checkAiRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSec: 300, remaining: 0 }),
    }));
    vi.doMock("openai", () => ({ default: vi.fn() }));

    const { POST } = await import("../route");
    const res = await POST(makeReq({ image: "/9j/4AAQSkZJRg", mimeType: "image/jpeg" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("rechaza imagen con magic bytes inválidos", async () => {
    vi.doMock("@/lib/get-user-id", () => ({ getUserId: vi.fn().mockResolvedValue(1) }));
    vi.doMock("@/lib/ai-rate-limit", () => ({
      checkAiRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 29 }),
    }));
    vi.doMock("openai", () => ({ default: vi.fn() }));

    const { POST } = await import("../route");
    // "RANDOM" no empieza con /9j/ (JPEG), iVBOR (PNG) ni UklGR (WebP)
    const res = await POST(makeReq({ image: "RANDOMBYTES", mimeType: "image/jpeg" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/formato/i);
  });
});
