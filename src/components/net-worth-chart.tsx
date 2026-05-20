"use client";

import { useFetch } from "@/hooks/use-fetch";
import { useLocaleCode, useT } from "@/lib/i18n";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface NetWorthSnapshot {
  id: number;
  date: string;
  cash: number;
  investments: number;
  savings_goals: number;
  debts: number;
  total: number;
  notes: string | null;
  created_at: string;
}

interface NetWorthCurrent {
  cash: number;
  investments: number;
  savings_goals: number;
  debts: number;
  total: number;
}

interface NetWorthApiResponse {
  current: NetWorthCurrent;
  history: NetWorthSnapshot[];
}

function formatDate(dateStr: string, localeCode: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${d.toLocaleDateString(localeCode, { month: "short" })}`;
}

function formatEur(value: number, localeCode: string): string {
  return `€${value.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NetWorthSummaryCard() {
  const localeCode = useLocaleCode();
  const t = useT();
  const fmtEur = (v: number) => formatEur(v, localeCode);
  const { data } = useFetch<NetWorthApiResponse>("/api/networth?limit=30");

  if (!data || !data.current) {
    return null;
  }

  const { current, history } = data;
  const latest = current;
  const prev = history.length > 0 ? history[history.length - 1] : null;
  const diff = prev ? latest.total - prev.total : null;

  return (
    <Card className="mt-3">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[10px] tracking-wide mb-2">PATRIMONIO NETO</p>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-primary">
              {fmtEur(latest.total)}
            </div>
            {diff !== null && (
              <div className={`text-sm mt-0.5 ${diff >= 0 ? "text-income" : "text-expense"}`}>
                {diff >= 0 ? "↑" : "↓"} {fmtEur(Math.abs(diff))} vs anterior
              </div>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Efectivo: {fmtEur(latest.cash)}</div>
            <div>Inversiones: {fmtEur(latest.investments)}</div>
            {latest.savings_goals > 0 && <div>{t("savingsLabel")}: {fmtEur(latest.savings_goals)}</div>}
            {latest.debts > 0 && <div className="text-expense">Deudas: -{fmtEur(latest.debts)}</div>}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{new Date().toISOString().slice(0, 10)}</div>
      </CardContent>
    </Card>
  );
}

interface ChartDataPoint {
  date: string;
  cash: number;
  investments: number;
  savings_goals: number;
  total: number;
}

export function NetWorthChart() {
  const localeCode = useLocaleCode();
  const fmtEur = (v: number) => formatEur(v, localeCode);
  const fmtDate = (d: string) => formatDate(d, localeCode);
  const { data } = useFetch<NetWorthApiResponse>("/api/networth?limit=30");

  if (!data || !data.current) {
    return (
      <Card className="mt-3">
        <CardContent className="p-4">
          <p className="text-muted-foreground text-[10px] tracking-wide mb-2">EVOLUCIÓN DEL PATRIMONIO</p>
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin datos todavía. Importa transacciones o añade una manualmente para ver tu patrimonio.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latest = data.current;
  const { history } = data;

  const chartData: ChartDataPoint[] = history.map((snap) => ({
    date: fmtDate(snap.date),
    cash: snap.cash,
    investments: snap.investments,
    savings_goals: snap.savings_goals,
    total: snap.total,
  }));

  return (
    <Card className="mt-3">
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-[10px] tracking-wide">EVOLUCIÓN DEL PATRIMONIO</p>
          <div className="text-xl font-bold text-primary">
            {fmtEur(latest.total)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorInvestments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    cash: "Efectivo",
                    investments: "Inversiones",
                    savings_goals: "Ahorros",
                  };
                  const numVal = typeof value === "number" ? value : 0;
                  const strName = typeof name === "string" ? name : String(name);
                  return [fmtEur(numVal), labels[strName] ?? strName];
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    cash: "Efectivo",
                    investments: "Inversiones",
                    savings_goals: "Ahorros",
                  };
                  return <span style={{ fontSize: 10, color: "#a1a1aa" }}>{labels[value] ?? value}</span>;
                }}
              />
              <Area
                type="monotone"
                dataKey="savings_goals"
                stackId="1"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#colorSavings)"
              />
              <Area
                type="monotone"
                dataKey="cash"
                stackId="1"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#colorCash)"
              />
              <Area
                type="monotone"
                dataKey="investments"
                stackId="1"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorInvestments)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-xs text-muted-foreground py-4">
            Registra al menos 2 snapshots para ver la evolución.
          </div>
        )}

        {/* Composition breakdown */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground tracking-wide">EFECTIVO</div>
            <div className="text-sm font-semibold text-income">{fmtEur(latest.cash)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground tracking-wide">INVERSIONES</div>
            <div className="text-sm font-semibold text-primary">{fmtEur(latest.investments)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground tracking-wide">AHORROS</div>
            <div className="text-sm font-semibold text-yellow-500">{fmtEur(latest.savings_goals)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
