import { NextRequest } from "next/server";
import { getTransactions } from "@/lib/queries";
import { getUserId } from "@/lib/get-user-id";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const p = req.nextUrl.searchParams;

    const format = p.get("format") ?? "csv";

    // Date filters
    const yearParam = p.get("year");
    const monthParam = p.get("month");

    let from = p.get("from") ?? undefined;
    let to = p.get("to") ?? undefined;

    // Build from/to from year/month params if provided
    if (yearParam && !from && !to) {
      const year = parseInt(yearParam, 10);
      if (monthParam) {
        const month = parseInt(monthParam, 10);
        from = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      } else {
        from = `${year}-01-01`;
        to = `${year}-12-31`;
      }
    }

    const data = await getTransactions(userId, {
      from,
      to,
      category: p.get("category") ?? undefined,
      expense_type: p.get("expense_type") ?? undefined,
      direction: p.get("direction") ?? undefined,
      limit: 10000,
      offset: 0,
    });

    // JSON format
    if (format === "json") {
      const label = buildLabel(yearParam, monthParam, from, to);
      const filename = `finance-export-${label}.json`;
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // CSV format (default)
    const headers = ["Date", "Description", "Category", "Type", "Direction", "Amount", "Currency", "EUR Amount", "Tags"];

    const rows = data.map((t) => [
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      t.category,
      t.expense_type ?? "",
      t.direction,
      t.amount,
      t.currency,
      t.eur_amount,
      `"${(t.tags ?? []).join(";")}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const label = buildLabel(yearParam, monthParam, from, to);
    const filename = `finance-export-${label}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function buildLabel(
  year: string | null,
  month: string | null,
  from: string | undefined,
  to: string | undefined,
): string {
  if (year && month) {
    return `${year}-${String(parseInt(month, 10)).padStart(2, "0")}`;
  }
  if (year) {
    return year;
  }
  if (from) {
    return from.slice(0, 7);
  }
  if (to) {
    return to.slice(0, 7);
  }
  return new Date().toISOString().slice(0, 7);
}
