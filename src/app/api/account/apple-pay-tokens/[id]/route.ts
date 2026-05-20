export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { revokeApplePayToken } from "@/lib/apple-pay-tokens";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const revoked = await revokeApplePayToken(userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
