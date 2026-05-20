"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { BottomTabs } from "./bottom-tabs";
import { AppTour } from "@/components/app-tour";
import { FeedbackWidget } from "@/components/feedback-widget";
import { OfflineBanner } from "./offline-banner";
import { startAutoSync } from "@/lib/offline-queue";

// Orden visual de las tabs (izq → dcha) en la bottom bar. Páginas
// fuera de este orden cuentan como "neutras" y entran con slide-from-right
// por defecto. Ajustar si cambia el orden del BottomTabs.
const TAB_ORDER: string[] = [
  "/dashboard",
  "/transactions",
  "/transactions/new",
  "/accounts",
];

function tabIndex(pathname: string): number {
  for (let i = 0; i < TAB_ORDER.length; i++) {
    const p = TAB_ORDER[i];
    if (pathname === p || pathname.startsWith(p + "/")) return i;
  }
  return -1;
}

const SHELL_BYPASS_PATHS = ["/", "/login", "/register", "/gate/e", "/gate/n", "/onboarding", "/welcome", "/screenshots", "/accounts/new", "/import", "/transactions/new"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = SHELL_BYPASS_PATHS.includes(pathname);
  const [showTour, setShowTour] = useState(false);

  // Dirección del slide entre tabs: guardamos el índice anterior para
  // decidir si entra desde la derecha (avance) o desde la izquierda
  // (retroceso).
  const prevTabIdxRef = useRef<number>(tabIndex(pathname));
  const [navDir, setNavDir] = useState<"forward" | "back">("forward");
  useEffect(() => {
    const curr = tabIndex(pathname);
    const prev = prevTabIdxRef.current;
    if (curr >= 0 && prev >= 0 && curr !== prev) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- determines slide direction from tab index comparison on route change; must be synchronous before render
      setNavDir(curr > prev ? "forward" : "back");
    }
    prevTabIdxRef.current = curr;
  }, [pathname]);

  // Check on every route change — onboarding sets the flag then navigates to /dashboard
  // The flag "fintrk-show-tour" is set fresh by onboarding and takes priority over "guide-seen"
  useEffect(() => {
    const shouldShow = localStorage.getItem("fintrk-show-tour");
    if (shouldShow === "1" && !showTour) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage on route change to pick up flag set by onboarding; must fire synchronously before render
      setShowTour(true);
    }
  }, [pathname, showTour]);

  // Drain offline queue whenever the device regains network.
  useEffect(() => {
    return startAutoSync();
  }, []);

  function dismissTour() {
    setShowTour(false);
    localStorage.setItem("fintrk-guide-seen", "1");
    localStorage.removeItem("fintrk-show-tour");
  }

  // Root del JSX SIEMPRE es un Fragment con <AppTour> en la misma posición.
  // Si separamos en dos returns con root distinto (Fragment vs div), React
  // desmonta y remonta TODO el árbol al cambiar de bypass ↔ no-bypass, y
  // AppTour pierde su state local (currentStep, phase) → vuelve al paso 1
  // en bucle al navegar al paso 2 (/transactions/new, ruta bypass).
  return (
    <>
      {isAuthPage ? (
        children
      ) : (
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <OfflineBanner />
            <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-[env(safe-area-inset-top)] sm:pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
              {/* Slide suave entre páginas al cambiar de tab. key={pathname}
                  fuerza remount → dispara la animación. page-slide-forward
                  entra desde la derecha (56px, 600ms); page-slide-back desde
                  la izquierda. Usa keyframes propias con translate3d para
                  que el movimiento se note en móvil. */}
              <div
                key={pathname}
                className={navDir === "forward" ? "page-slide-forward" : "page-slide-back"}
              >
                {children}
              </div>
            </div>
          </main>
          <BottomTabs />
          <FeedbackWidget />
        </div>
      )}
      {showTour && <AppTour onDismiss={dismissTour} />}
    </>
  );
}
