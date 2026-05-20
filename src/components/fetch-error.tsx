"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface FetchErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function FetchError({ message, onRetry }: FetchErrorProps) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4 animate-in">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      <div>
        <p className="font-semibold mb-1">{message ?? t("fetchErrorDefault")}</p>
        <p className="text-sm text-muted-foreground">{t("fetchErrorDesc")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
