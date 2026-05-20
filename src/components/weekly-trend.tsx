"use client";

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface WeeklyTrendProps {
  data: { week: string; income: number; expenses: number }[];
}

export function WeeklyTrend({ data }: WeeklyTrendProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-[10px] tracking-wide">TENDENCIA SEMANAL</p>
          <p className="text-xs text-muted-foreground">Últimas 8 semanas</p>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data}>
            <XAxis dataKey="week" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
            />
            <Bar dataKey="income" fill="#22c55e" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#ef4444" opacity={0.5} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
