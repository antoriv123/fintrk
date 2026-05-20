"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  const detail = [error.digest ? `Digest: ${error.digest}` : "", error.message]
    .filter(Boolean)
    .join("\n")
    .slice(0, 200);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6 text-center">
      <div className="rounded-3xl bg-red-500/10 p-6">
        <AlertTriangle className="h-12 w-12 text-red-400" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-xl font-bold mb-2">Algo salió mal</p>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Ha ocurrido un error inesperado. Intenta de nuevo.
        </p>
      </div>
      {detail && (
        <details className="w-full max-w-xs rounded-2xl border border-border bg-card px-4 py-3 text-left">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            Detalles técnicos
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
      <Button onClick={reset} className="gap-2">
        <RefreshCw size={16} />
        Reintentar
      </Button>
    </div>
  );
}
