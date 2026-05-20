import { describe, it, expect, beforeAll } from "vitest";

// JWT_SECRET must be set before importing the module (it reads env at import).
beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-for-apple-pay-tokens-1234567890";
});

async function load() {
  return await import("../apple-pay-tokens");
}

describe("generateApplePayToken", () => {
  it("produces a fpat_-prefixed token with high entropy", async () => {
    const { generateApplePayToken } = await load();
    const { token } = generateApplePayToken();
    expect(token.startsWith("fpat_")).toBe(true);
    // base64url of 32 bytes = 43 chars; total >= 48
    expect(token.length).toBeGreaterThanOrEqual(48);
    // only URL-safe characters after the prefix
    expect(token.slice(5)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is unique across invocations", async () => {
    const { generateApplePayToken } = await load();
    const a = generateApplePayToken().token;
    const b = generateApplePayToken().token;
    expect(a).not.toBe(b);
  });

  it("returns a hash derived from the token (HMAC), deterministic", async () => {
    const { generateApplePayToken, hashApplePayToken } = await load();
    const { token, hash } = generateApplePayToken();
    expect(hash).toBe(hashApplePayToken(token));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a preview masking the middle", async () => {
    const { generateApplePayToken } = await load();
    const { token, preview } = generateApplePayToken();
    expect(preview.startsWith("fpat_")).toBe(true);
    expect(preview).toContain("...");
    expect(preview.length).toBeLessThan(token.length);
    // starts with token prefix and ends with last 4 chars of token
    expect(preview.endsWith(token.slice(-4))).toBe(true);
  });
});

describe("hashApplePayToken", () => {
  it("is deterministic for the same token", async () => {
    const { hashApplePayToken } = await load();
    expect(hashApplePayToken("fpat_abc123"))
      .toBe(hashApplePayToken("fpat_abc123"));
  });

  it("differs for different tokens", async () => {
    const { hashApplePayToken } = await load();
    expect(hashApplePayToken("fpat_abc"))
      .not.toBe(hashApplePayToken("fpat_xyz"));
  });

  it("rejects empty/invalid input", async () => {
    const { hashApplePayToken } = await load();
    expect(() => hashApplePayToken("")).toThrow();
    expect(() => hashApplePayToken("no_prefix")).toThrow();
  });
});

describe("previewToken", () => {
  it("masks the middle of the token", async () => {
    const { previewToken } = await load();
    const token = "fpat_abcdef1234567890WXYZ";
    const preview = previewToken(token);
    expect(preview.startsWith("fpat_abcd")).toBe(true);
    expect(preview).toContain("...");
    expect(preview.endsWith("WXYZ")).toBe(true);
  });
});
