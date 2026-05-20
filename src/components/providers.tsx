"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { getAuthToken, resolveApiUrl, getApiBaseUrl } from "@/lib/api";
import { I18nProvider, getStoredLocale, type Locale } from "@/lib/i18n";
import { PremiumProvider } from "@/components/premium/premium-provider";
import { InitialLoadProvider, useInitialLoad } from "@/lib/initial-load";
import { AppLoader } from "@/components/app-loader";

const fetcher = async (url: string) => {
  const headers: Record<string, string> = {};

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Native bundle: prepende NEXT_PUBLIC_API_URL a /api/* (mismo trato que
  // apiFetch). Sin esto useFetch hace fetch a capacitor://localhost/api/...
  // que es 404 dentro del bundle estático y todo queda en blanco.
  const resolvedUrl = resolveApiUrl(url);
  const isCrossOrigin = resolvedUrl !== url;

  const r = await fetch(resolvedUrl, {
    headers,
    credentials: isCrossOrigin ? "omit" : "include",
  });
  const parseErrorBody = async (): Promise<unknown> => {
    const contentType = r.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return await r.json().catch(() => null);
    }
    return await r.text().catch(() => "");
  };
  const getBodyField = (body: unknown, key: string): string | undefined => {
    if (!body || typeof body !== "object") return undefined;
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  };

  if (r.status === 401) {
    const body = await parseErrorBody();
    localStorage.removeItem("ft_token");
    window.location.href = "/gate/e";
    const message = getBodyField(body, "error") ?? "Unauthorized";
    const error = new Error(message) as Error & { status?: number; detail?: string; body?: unknown };
    error.status = r.status;
    error.detail = getBodyField(body, "detail");
    error.body = body;
    throw error;
  }
  if (!r.ok) {
    const body = await parseErrorBody();
    const message =
      getBodyField(body, "error") ??
      getBodyField(body, "message") ??
      (typeof body === "string" && body.trim() ? body.trim() : `API error: ${r.status}`);
    const detail =
      getBodyField(body, "detail") ??
      getBodyField(body, "reason");
    const error = new Error(message) as Error & { status?: number; detail?: string; body?: unknown };
    error.status = r.status;
    error.detail = detail;
    error.body = body;
    throw error;
  }
  return r.json();
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("es");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage to initialize locale from user preference on mount; browser-only
    setLocale(getStoredLocale());
  }, []);

  return (
    <I18nProvider value={locale}>
      <SWRConfig
        value={{
          fetcher,
          revalidateOnFocus: false,
          dedupingInterval: 5000,
        }}
      >
        <PremiumProvider>
          <InitialLoadProvider>
            {children}
            <GlobalSplash />
          </InitialLoadProvider>
        </PremiumProvider>
      </SWRConfig>
    </I18nProvider>
  );
}

/**
 * Splash global: se muestra SOLO en la primera carga de la app (antes
 * de que el dashboard haya podido poblar summary + networth). Una vez
 * dashboard llama markLoaded(), este componente se desmonta y no
 * vuelve a aparecer al navegar entre tabs. Tampoco aparece si el
 * usuario está en rutas públicas (/welcome, /login) — sólo cuando
 * hay una sesión activa y el primer dashboard está cargando.
 */
function GlobalSplash() {
  const { loaded } = useInitialLoad();
  const pathname = usePathname();
  const [hiding, setHiding] = useState(false);

  // Cuando el dashboard marca loaded=true, esperamos 280ms (fade-out) y
  // luego dejamos de renderizar el splash. `hiding` persiste dentro del
  // componente — así, si el user navega a otra ruta y vuelve a
  // /dashboard, el splash NO reaparece.
  useEffect(() => {
    if (loaded) {
      const t = setTimeout(() => setHiding(true), 280);
      return () => clearTimeout(t);
    }
  }, [loaded]);

  // Fallback: si nadie llama markLoaded en 4s (p.ej. el user entra
  // directo a /dashboard pero el fetch falla), ocultamos igualmente.
  useEffect(() => {
    const t = setTimeout(() => setHiding(true), 4000);
    return () => clearTimeout(t);
  }, []);

  // Solo queremos el splash al arrancar la app en /dashboard. En
  // cualquier otra ruta devolvemos null sin tocar `loaded`, así el flag
  // permanece false hasta que realmente llegue al dashboard y su efecto
  // llame markLoaded().
  if (pathname !== "/dashboard") return null;
  if (hiding) return null;

  return (
    <div
      aria-hidden={loaded}
      style={{
        opacity: loaded ? 0 : 1,
        transition: "opacity 280ms ease-out",
        pointerEvents: loaded ? "none" : "auto",
      }}
    >
      <AppLoader />
    </div>
  );
}
