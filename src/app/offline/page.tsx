"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export default function OfflinePage() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 px-6">
      <div className="rounded-3xl bg-muted p-6">
        <WifiOff className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h1 className="text-xl font-bold mb-2">{t("offlineTitle")}</h1>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          {t("offlineDesc")}
        </p>
      </div>
      <Button
        onClick={() => window.location.reload()}
        className="gap-2"
      >
        <RefreshCw size={16} />
        {t("retry")}
      </Button>
    </div>
  );
}
