"use client";

import { ArrowLeft, Share, Plus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function InstallPage() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads matchMedia on mount; can only run in browser (SSR would return false), sync call is intentional
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }, []);

  if (isStandalone) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 px-6">
        <div className="w-16 h-16 rounded-2xl bg-[#2D6A4F]/15 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-[#2D6A4F]" />
        </div>
        <div>
          <h1 className="text-xl font-bold mb-2">Ya tienes fintrk instalada</h1>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Estas usando la app desde tu pantalla de inicio. Todo listo.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-6 py-2.5 bg-[#2D6A4F] text-white rounded-lg font-medium text-sm hover:bg-[#245A42] transition-colors"
        >
          Ir al dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted/60 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">Instalar fintrk</h1>
      </div>

      {/* Intro */}
      <div className="rounded-2xl bg-muted/40 p-4 mb-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          fintrk funciona como una app nativa en tu iPhone. Anadela a tu pantalla de inicio para acceder con un toque, pantalla completa y sin barra de Safari.
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-4">
        {/* Step 1 */}
        <div className="rounded-2xl bg-muted/40 overflow-hidden">
          <div className="flex items-start gap-3.5 p-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#2D6A4F]/15 text-[#2D6A4F] font-bold text-sm shrink-0">
              1
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Abre fintrk en Safari</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Importante: tiene que ser <span className="font-medium text-foreground">Safari</span>, no Chrome ni otro navegador. Solo Safari permite instalar apps web.
              </p>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl bg-muted/40 overflow-hidden">
          <div className="flex items-start gap-3.5 p-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#2D6A4F]/15 text-[#2D6A4F] font-bold text-sm shrink-0">
              2
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Pulsa el boton de compartir</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                En la barra inferior de Safari, toca el icono de compartir:
              </p>
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/15">
                <Share size={20} className="text-blue-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl bg-muted/40 overflow-hidden">
          <div className="flex items-start gap-3.5 p-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#2D6A4F]/15 text-[#2D6A4F] font-bold text-sm shrink-0">
              3
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Selecciona &ldquo;Añadir a pantalla de inicio&rdquo;</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                Desliza hacia abajo en el menu y busca esta opcion:
              </p>
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-background/60 border border-border/40">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted">
                  <Plus size={16} className="text-muted-foreground" />
                </div>
                <span className="text-sm">Añadir a pantalla de inicio</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="rounded-2xl bg-muted/40 overflow-hidden">
          <div className="flex items-start gap-3.5 p-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#2D6A4F]/15 text-[#2D6A4F] font-bold text-sm shrink-0">
              4
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Confirma y listo</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pulsa <span className="font-medium text-foreground">&ldquo;Añadir&rdquo;</span> en la esquina superior derecha. fintrk aparecera en tu pantalla de inicio como cualquier otra app.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tip */}
      <div className="mt-6 rounded-2xl border border-[#2D6A4F]/20 bg-[#2D6A4F]/5 p-4">
        <p className="text-xs text-[#2D6A4F]/80 leading-relaxed">
          <span className="font-semibold">Tip:</span> Una vez instalada, fintrk se abre a pantalla completa, recibe notificaciones y funciona incluso sin conexión.
        </p>
      </div>
    </div>
  );
}
