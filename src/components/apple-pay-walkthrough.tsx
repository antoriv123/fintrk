"use client";

/**
 * Walkthrough visual paso-a-paso para crear la Automatizacion Personal
 * "Transaccion" de iOS. 5 miniaturas ilustradas en lugar de un screencast real
 * — evita tener que hostear un MP4 y funciona offline.
 *
 * Cada paso: mini screenshot estilizado del iPhone + texto debajo.
 */

interface Step {
  n: number;
  title: string;
  detail: string;
  mock: React.ReactNode;
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full aspect-[9/16] max-w-[180px] mx-auto rounded-2xl border-2 border-border bg-background shadow-sm overflow-hidden relative">
      <div className="h-4 bg-muted flex items-center justify-center">
        <div className="w-12 h-1 rounded-full bg-border" />
      </div>
      <div className="p-2 text-[9px] leading-tight">{children}</div>
    </div>
  );
}

function TapDot({ x, y, label }: { x: string; y: string; label: string }) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      <div className="relative">
        <div className="absolute inset-0 w-6 h-6 -m-1 rounded-full bg-primary/30 animate-ping" />
        <div className="w-4 h-4 rounded-full bg-primary border-2 border-background" />
      </div>
      <div className="absolute left-full ml-1 top-0 text-[9px] font-bold text-primary whitespace-nowrap bg-background px-1 rounded">
        {label}
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    n: 1,
    title: "Abre Atajos",
    detail: "En tu iPhone → app Atajos. Ve a la pestana Automatizacion abajo.",
    mock: (
      <Phone>
        <div className="font-semibold mb-1.5">Atajos</div>
        <div className="grid grid-cols-3 gap-1 mb-3">
          <div className="bg-[#0EA5E9]/30 rounded h-5" />
          <div className="bg-blue-500/30 rounded h-5" />
          <div className="bg-pink-500/30 rounded h-5" />
        </div>
        <div className="flex gap-2 text-[8px] text-muted-foreground border-t pt-1">
          <span>Mis</span>
          <span className="font-bold text-primary relative">
            Autom
            <TapDot x="50%" y="0%" label="" />
          </span>
          <span>Galeria</span>
        </div>
      </Phone>
    ),
  },
  {
    n: 2,
    title: "Crear nueva",
    detail: "Pulsa el + arriba a la derecha y elige Crear automatizacion personal.",
    mock: (
      <Phone>
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold">Automatizacion</span>
          <div className="relative">
            <span className="font-bold text-primary text-sm">+</span>
            <TapDot x="50%" y="50%" label="" />
          </div>
        </div>
        <div className="space-y-1">
          <div className="bg-muted/50 rounded p-1 text-muted-foreground">Ninguna aun</div>
        </div>
      </Phone>
    ),
  },
  {
    n: 3,
    title: "Elige Transaccion",
    detail: "Scroll hasta encontrar el trigger Transaccion (icono tarjeta) y selecciona Apple Pay.",
    mock: (
      <Phone>
        <div className="font-semibold mb-1.5">Nueva automatizacion</div>
        <div className="space-y-1 text-muted-foreground">
          <div className="rounded p-1 bg-muted/30">Hora</div>
          <div className="rounded p-1 bg-muted/30">Llegada</div>
          <div className="rounded p-1 bg-primary/20 text-primary font-semibold relative">
            Transaccion
            <TapDot x="90%" y="50%" label="" />
          </div>
          <div className="rounded p-1 bg-muted/30">Mensaje</div>
        </div>
      </Phone>
    ),
  },
  {
    n: 4,
    title: "Ejecutar atajo",
    detail: "Anadir accion → busca Ejecutar atajo → elige Fintrk: Log Apple Pay. Pasa las variables como entrada.",
    mock: (
      <Phone>
        <div className="font-semibold mb-1.5">Nuevo atajo</div>
        <div className="bg-primary/10 border border-primary/30 rounded p-1 mb-1.5">
          <div className="font-semibold text-primary text-[8px]">Ejecutar atajo</div>
          <div className="text-muted-foreground text-[8px]">Fintrk: Log Apple Pay</div>
        </div>
        <div className="bg-muted/50 rounded p-1 text-muted-foreground relative">
          + Anadir accion
          <TapDot x="95%" y="50%" label="" />
        </div>
      </Phone>
    ),
  },
  {
    n: 5,
    title: "Desactivar pregunta",
    detail: "CRITICO: desactiva Preguntar antes de ejecutar. Si no, iOS te pide confirmar cada compra.",
    mock: (
      <Phone>
        <div className="font-semibold mb-2 text-[9px]">Antes de ejecutar</div>
        <div className="bg-muted/50 rounded p-1.5 mb-1 flex items-center justify-between">
          <span className="text-muted-foreground text-[8px]">Preguntar</span>
          <div className="w-5 h-3 bg-muted-foreground/30 rounded-full relative">
            <div className="absolute left-0 top-0.5 w-2 h-2 bg-background rounded-full border" />
            <TapDot x="50%" y="50%" label="OFF" />
          </div>
        </div>
        <div className="text-[8px] text-muted-foreground leading-tight">
          Tiene que quedar apagado
        </div>
      </Phone>
    ),
  },
];

export function AutomationWalkthrough() {
  return (
    <div className="space-y-4">
      {STEPS.map((step) => (
        <div key={step.n} className="flex gap-3 items-start">
          <div className="flex-shrink-0 w-20">
            {step.mock}
          </div>
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {step.n}
              </div>
              <div className="font-semibold text-sm">{step.title}</div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {step.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
