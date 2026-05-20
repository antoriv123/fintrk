"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Cta =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: Cta;
  tone?: "muted" | "brand";
}

export function EmptyState({ icon: Icon, title, description, cta, tone = "muted" }: EmptyStateProps) {
  const iconBg = tone === "brand" ? "bg-primary/10" : "bg-muted";
  const iconColor = tone === "brand" ? "text-primary" : "text-muted-foreground";

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
      <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center`}>
        <Icon size={24} className={iconColor} strokeWidth={1.75} />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      {cta?.href && (
        <Button asChild size="sm" className="rounded-xl bg-primary hover:bg-primary/90">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
      {cta?.onClick && (
        <Button size="sm" onClick={cta.onClick} className="rounded-xl bg-primary hover:bg-primary/90">
          {cta.label}
        </Button>
      )}
    </div>
  );
}
