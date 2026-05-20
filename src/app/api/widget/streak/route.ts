export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Compact endpoint for the iOS Streak widget.
 * Returns current streak + best + whether today counts as "lit".
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const today = new Date().toISOString().slice(0, 10);

    const [streakRow] = await sql(
      "SELECT current_streak, best_streak FROM streaks WHERE user_id = $1",
      [userId],
    );
    const current = Number(streakRow?.current_streak ?? 0);
    const best = Number(streakRow?.best_streak ?? 0);

    const [todayTx] = await sql(
      "SELECT 1 AS ok FROM transactions WHERE user_id = $1 AND date = $2 LIMIT 1",
      [userId, today],
    );
    const [todayCheck] = await sql(
      "SELECT 1 AS ok FROM daily_checkins WHERE user_id = $1 AND date = $2 LIMIT 1",
      [userId, today],
    ).catch(() => [undefined]);

    const isLit = !!todayTx || !!todayCheck;

    return NextResponse.json({ current, best, isLit, lastCheckIn: today });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
