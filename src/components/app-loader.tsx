"use client";

import { useEffect, useState } from "react";
import { FintrkLogo } from "@/components/fintrk-logo";
import { useT } from "@/lib/i18n";

/**
 * Overlay fullscreen que reemplaza al skeleton vacío cuando el usuario
 * entra a la app y los datos aún no han llegado. Pensado para la primera
 * carga del dashboard: logo + spinner + frase rotativa con un toque
 * personal para que no parezca que la app está trabada.
 *
 * Respeta `prefers-reduced-motion`: en ese caso el spinner no gira y la
 * frase no rota.
 */
export function AppLoader() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [idx, setIdx] = useState(0);

  // Frases rotativas desde i18n. Si alguna falta caemos al primer string
  // cargable. Mantenemos 5 por idioma para que no se sienta repetitivo
  // en cargas de ~2-5s.
  const messages = [
    t("loaderMsg1"),
    t("loaderMsg2"),
    t("loaderMsg3"),
    t("loaderMsg4"),
    t("loaderMsg5"),
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8 bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        animation: "fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      role="status"
      aria-live="polite"
    >
      <FintrkLogo size="xl" />
      <div className="relative w-12 h-12 motion-reduce:animate-none">
        <div className="absolute inset-0 rounded-full border-[3px] border-[#2D6A4F]/15" />
        <div
          className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#2D6A4F] animate-spin motion-reduce:hidden"
          style={{ animationDuration: "0.9s" }}
        />
        {/* Fallback estático para reduced-motion: un pequeño punto
             en la parte superior para indicar estado sin animación. */}
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#2D6A4F] hidden motion-reduce:block" />
      </div>
      <p
        key={idx}
        className="text-sm font-medium text-muted-foreground text-center px-8 max-w-xs"
        style={{ animation: "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {messages[idx] ?? messages[0]}
      </p>
    </div>
  );
}
