import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-for-apple-pay-ingest-1234567890";
});

async function load() {
  return await import("../apple-pay-ingest");
}

describe("normalizeIngestPayload", () => {
  it("accepts a well-formed Apple Pay payload", async () => {
    const { normalizeIngestPayload } = await load();
    const result = normalizeIngestPayload({
      amount: 4.5,
      currency: "EUR",
      merchant: "Mercadona Madrid",
      date: "2026-04-21T14:32:00Z",
      card_last4: "1234",
      external_id: "apple-tx-abc",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount).toBe(4.5);
    expect(result.value.currency).toBe("EUR");
    expect(result.value.merchant).toBe("Mercadona Madrid");
    expect(result.value.date).toBe("2026-04-21");
    expect(result.value.card_last4).toBe("1234");
    expect(result.value.external_id).toBe("apple-tx-abc");
  });

  it("accepts date as YYYY-MM-DD directly", async () => {
    const { normalizeIngestPayload } = await load();
    const result = normalizeIngestPayload({
      amount: 12,
      merchant: "Taxi",
      date: "2026-04-21",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.date).toBe("2026-04-21");
  });

  it("normalizes currency to uppercase and defaults to EUR", async () => {
    const { normalizeIngestPayload } = await load();
    const a = normalizeIngestPayload({ amount: 1, merchant: "X", date: "2026-04-21", currency: "usd" });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value.currency).toBe("USD");

    const b = normalizeIngestPayload({ amount: 1, merchant: "X", date: "2026-04-21" });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.currency).toBe("EUR");
  });

  it("rejects missing required fields", async () => {
    const { normalizeIngestPayload } = await load();
    expect(normalizeIngestPayload({}).ok).toBe(false);
    expect(normalizeIngestPayload({ amount: 10 }).ok).toBe(false);
    expect(normalizeIngestPayload({ amount: 10, merchant: "X" }).ok).toBe(false);
  });

  it("rejects negative, zero or non-finite amounts", async () => {
    const { normalizeIngestPayload } = await load();
    expect(normalizeIngestPayload({ amount: -5, merchant: "X", date: "2026-04-21" }).ok).toBe(false);
    expect(normalizeIngestPayload({ amount: 0, merchant: "X", date: "2026-04-21" }).ok).toBe(false);
    expect(normalizeIngestPayload({ amount: "abc", merchant: "X", date: "2026-04-21" }).ok).toBe(false);
  });

  it("accepts numeric amount as string (from Shortcut text field)", async () => {
    const { normalizeIngestPayload } = await load();
    const r = normalizeIngestPayload({ amount: "4,50", merchant: "X", date: "2026-04-21" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(4.5);
  });

  it("rejects invalid dates", async () => {
    const { normalizeIngestPayload } = await load();
    expect(normalizeIngestPayload({ amount: 1, merchant: "X", date: "not-a-date" }).ok).toBe(false);
    expect(normalizeIngestPayload({ amount: 1, merchant: "X", date: 12345 }).ok).toBe(false);
  });

  it("rejects card_last4 that is not 4 digits", async () => {
    const { normalizeIngestPayload } = await load();
    const r = normalizeIngestPayload({
      amount: 1, merchant: "X", date: "2026-04-21", card_last4: "12a4",
    });
    expect(r.ok).toBe(true); // invalid last4 is dropped, not a hard error
    if (r.ok) expect(r.value.card_last4).toBeNull();
  });

  it("strips HTML from merchant", async () => {
    const { normalizeIngestPayload } = await load();
    const r = normalizeIngestPayload({
      amount: 1, merchant: "<script>alert('x')</script>Mercadona", date: "2026-04-21",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.merchant).not.toContain("<script>");
  });
});

describe("pickDefaultAccount", () => {
  it("returns slug matching account name containing last4 if any", async () => {
    const { pickDefaultAccount } = await load();
    const accounts = [
      { slug: "revolut", name: "Revolut 1234" },
      { slug: "bbva", name: "BBVA Cuenta" },
    ];
    expect(pickDefaultAccount(accounts, "1234")).toBe("revolut");
  });

  it("falls back to first account when no last4 match", async () => {
    const { pickDefaultAccount } = await load();
    const accounts = [
      { slug: "revolut", name: "Revolut" },
      { slug: "bbva", name: "BBVA Cuenta" },
    ];
    expect(pickDefaultAccount(accounts, "9999")).toBe("revolut");
    expect(pickDefaultAccount(accounts, null)).toBe("revolut");
  });

  it("returns null when no accounts", async () => {
    const { pickDefaultAccount } = await load();
    expect(pickDefaultAccount([], "1234")).toBeNull();
  });
});

describe("isExternalDuplicate + isContentDuplicate", () => {
  it("flags same external_id", async () => {
    const { isExternalDuplicate } = await load();
    const prior = [{ external_id: "abc", transaction_id: 1 }];
    const match = isExternalDuplicate(prior, "abc");
    expect(match?.transaction_id).toBe(1);
    expect(isExternalDuplicate(prior, "xyz")).toBeNull();
    expect(isExternalDuplicate(prior, null)).toBeNull();
  });

  it("flags same merchant + same date + same amount", async () => {
    const { isContentDuplicate } = await load();
    const existing = [
      { date: "2026-04-21", amount: 4.5, description: "Mercadona Madrid" },
    ];
    const hit = isContentDuplicate(existing, {
      date: "2026-04-21", amount: 4.5, description: "Mercadona Barcelona 9999",
    });
    expect(hit).toBe(true);
  });

  it("does not flag when merchant differs", async () => {
    const { isContentDuplicate } = await load();
    const existing = [
      { date: "2026-04-21", amount: 4.5, description: "Lidl Madrid" },
    ];
    const hit = isContentDuplicate(existing, {
      date: "2026-04-21", amount: 4.5, description: "Mercadona",
    });
    expect(hit).toBe(false);
  });
});
