import { NextRequest, NextResponse } from "next/server";
import { getSummary } from "@/lib/queries";
import { getUserId } from "@/lib/get-user-id";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const p = req.nextUrl.searchParams;
    const now = new Date();
    const from = p.get("from") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = p.get("to") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;

    return NextResponse.json(await getSummary(userId, from, to));
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
