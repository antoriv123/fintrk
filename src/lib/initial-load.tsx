"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Estado en memoria que indica si ya se completó la primera carga de la
 * app (el AppLoader de bienvenida). Vive una sola vez por sesión.
 *
 * - `loaded=false` al arrancar: el AppShell muestra el overlay splash.
 * - El dashboard llama `markLoaded()` cuando summary + networth están
 *   disponibles; a partir de ahí el loader desaparece y no vuelve a
 *   aparecer al navegar entre tabs.
 */
interface InitialLoadCtxValue {
  loaded: boolean;
  markLoaded: () => void;
}

const InitialLoadCtx = createContext<InitialLoadCtxValue>({
  loaded: true,
  markLoaded: () => {},
});

export function InitialLoadProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const markLoaded = useCallback(() => setLoaded(true), []);
  return (
    <InitialLoadCtx.Provider value={{ loaded, markLoaded }}>
      {children}
    </InitialLoadCtx.Provider>
  );
}

export function useInitialLoad(): InitialLoadCtxValue {
  return useContext(InitialLoadCtx);
}
