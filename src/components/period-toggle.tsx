"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type Period = "day" | "week" | "month";

interface PeriodToggleProps {
  value: Period;
  onChange: (period: Period) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Period)}>
      <TabsList>
        <TabsTrigger value="day">Día</TabsTrigger>
        <TabsTrigger value="week">Semana</TabsTrigger>
        <TabsTrigger value="month">Mes</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
