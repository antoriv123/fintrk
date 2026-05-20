export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import {
  createApplePayToken,
  listApplePayTokens,
  countRecentImports,
} from "@/lib/apple-pay-tokens";
import { sanitizeText } from "@/lib/sanitize";

const MAX_ACTIVE_TOKENS = 5;

export async function GET() {
  const userId = await getUserId();
  const [tokens, imports30d] = await Promise.all([
    listApplePayTokens(userId),
    countRecentImports(userId, 30),
  ]);
  return NextResponse.json({ tokens, imports_30d: imports30d });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = sanitizeText(body?.name, 50) || "iPhone";

  // Cap active tokens per user so a compromised session can't spam tokens.
  const existing = await listApplePayTokens(userId);
  const active = existing.filter((t) => !t.revoked_at);
  if (active.length >= MAX_ACTIVE_TOKENS) {
    return NextResponse.json(
      { error: `Maximo ${MAX_ACTIVE_TOKENS} tokens activos. Revoca uno antes de crear otro.` },
      { status: 400 },
    );
  }

  const { token, row } = await createApplePayToken(userId, name);
  return NextResponse.json({ token, tokenInfo: row }, { status: 201 });
}
