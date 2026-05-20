"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import {
  X, ChevronRight, Wallet, Camera, Sparkles, Flame,
  ArrowRight, Check, PartyPopper, ArrowDown,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

/* ─── Highlight: an element to spotlight within a step ─── */
interface Highlight {
  selector: string;       // data-tour attribute value
  titleKey: string;
  descKey: string;
  position: "above" | "below";
}

/* ─── Tour Step ─── */
interface TourStep {
  id: string;
  route: string;
  icon: typeof Camera;
  iconBg: string;
  titleKey: string;
  descKey: string;
  emptyDescKey?: string;
  tipKey: string;
  actionKey: string;
  number: number;
  highlights: Highlight[];
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "accounts",
    route: "/accounts",
    icon: Wallet,
    iconBg: "#3B82F6",
    titleKey: "tourAccountsTitle",
    descKey: "tourAccountsDesc",
    tipKey: "tourAccountsTip",
    actionKey: "tourTryNow",
    number: 1,
    highlights: [
      { selector: "accounts-create", titleKey: "tourHlAccountsCreate", descKey: "tourHlAccountsCreateDesc", position: "below" },
    ],
  },
  {
    id: "add",
    route: "/transactions/new",
    icon: Camera,
    iconBg: "#2D6A4F",
    titleKey: "tourAddTitle",
    descKey: "tourAddDesc",
    tipKey: "tourAddTip",
    actionKey: "tourTryNow",
    number: 2,
    // /transactions/new arranca en step===0 (CAPTURE) y muestra los 3 botones
    // con data-tour. Highlights guían al user por cada modo: foto ticket,
    // captura banco, manual. Si por alguna razón no se encuentra el target,
    // SpotlightOverlay muestra fallback con la explicación flotante.
    highlights: [
      { selector: "add-scan", titleKey: "tourHlScanTicket", descKey: "tourHlScanTicketDesc", position: "below" },
      { selector: "add-bank", titleKey: "tourHlBankCapture", descKey: "tourHlBankCaptureDesc", position: "below" },
      { selector: "add-manual", titleKey: "tourHlManual", descKey: "tourHlManualDesc", position: "below" },
    ],
  },
  {
    id: "insights",
    route: "/insights",
    icon: Sparkles,
    iconBg: "#0EA5E9",
    titleKey: "tourInsightsTitle",
    descKey: "tourInsightsDesc",
    emptyDescKey: "tourInsightsEmptyDesc",
    tipKey: "tourInsightsTip",
    actionKey: "tourSeeIt",
    number: 3,
    highlights: [
      { selector: "insights-generate", titleKey: "tourHlGenerate", descKey: "tourHlGenerateDesc", position: "below" },
    ],
  },
  {
    id: "streak",
    route: "/achievements",
    icon: Flame,
    iconBg: "#FF6B35",
    titleKey: "tourStreakTitle",
    descKey: "tourStreakDesc",
    tipKey: "tourStreakTip",
    actionKey: "tourSeeIt",
    number: 4,
    highlights: [
      { selector: "streak-card", titleKey: "tourHlStreakCard", descKey: "tourHlStreakCardDesc", position: "below" },
    ],
  },
];

/* ─── CSS ─── */
const STYLES = `
@keyframes tourFadeIn { from{opacity:0} to{opacity:1} }
@keyframes tourSlideUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
@keyframes tourSlideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
@keyframes tourPulse { 0%,100%{box-shadow:0 0 0 0 rgba(45,106,79,0.4)} 50%{box-shadow:0 0 0 12px rgba(45,106,79,0)} }
@keyframes tourBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes tourConfetti { 0%{transform:translateY(0) rotate(0) scale(1);opacity:1} 100%{transform:translateY(-120px) rotate(720deg) scale(0);opacity:0} }
@keyframes tourScaleIn { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes tourArrowBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
@keyframes tourSpotlight { 0%{box-shadow:0 0 0 4px rgba(45,106,79,0.6),0 0 20px rgba(45,106,79,0.3)} 50%{box-shadow:0 0 0 8px rgba(45,106,79,0.3),0 0 40px rgba(45,106,79,0.15)} 100%{box-shadow:0 0 0 4px rgba(45,106,79,0.6),0 0 20px rgba(45,106,79,0.3)} }
`;

/* ─── Confetti ─── */
function Confetti() {
  const colors = ["#2D6A4F","#3B82F6","#F59E0B","#E76F51","#EF4444","#10B981"];
  // Memoize random positions/durations so they are computed once per mount,
  // not re-randomised on every render (also silences react-hooks/purity).
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${10 + Math.random() * 80}%`,
        top: `${30 + Math.random() * 40}%`,
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
        color: colors[i % colors.length],
        duration: `${1 + Math.random()}s`,
        delay: `${Math.random() * 0.5}s`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computed once on mount; colors is a module-level constant
    [],
  );
  return (
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      {particles.map((p, i) => (
        <div key={i} style={{
          position:"absolute",left:p.left,top:p.top,
          width:8,height:8,borderRadius:p.borderRadius,
          backgroundColor:p.color,
          animation:`tourConfetti ${p.duration} ease-out ${p.delay} forwards`,
        }}/>
      ))}
    </div>
  );
}

/* ─── Spotlight Overlay: highlights a DOM element ─── */
function SpotlightOverlay({
  highlight, stepColor, onNext, onDone, isLast,

  t,
}: {
  highlight: Highlight;
  stepColor: string;
  onNext: () => void;
  onDone: () => void;
  isLast: boolean;
  t: (key: string) => string;
}) {
  // Helpers: localizar el elemento y medirlo. Separados porque al encontrar
  // necesitamos scrollearlo a la vista antes de fijar el rect — si el botón
  // está fuera del viewport (típico en /insights donde "Generar análisis"
  // está bajo el welcome banner + stats), el spotlight se dibuja offscreen
  // y el user solo ve overlay oscuro sin entender qué pasa.
  const findEl = useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    return document.querySelector(`[data-tour="${highlight.selector}"]`) as HTMLElement | null;
  }, [highlight.selector]);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [searching, setSearching] = useState<boolean>(true);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Búsqueda + scroll al elemento. Cuando lo encontramos:
  //  1. scrollIntoView({ block: "center" }) para garantizar visibilidad.
  //  2. esperar a que el scroll termine (~400ms) y re-medir.
  //  3. fijar rect → renderiza spotlight en posición correcta.
  // Polling cada 150ms hasta 8s. /insights tarda en montar el botón (fetch
  // + Suspense). Si al timeout no aparece, fallback estático con onDone.
  useLayoutEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const measure = (el: HTMLElement) => {
      const initialRect = el.getBoundingClientRect();
      // Reservamos espacio: 88px arriba para el top bar del tour, 240px
      // abajo para la card. Si el elemento cae fuera de esa franja útil,
      // scrolleamos.
      const topMargin = 88;
      const bottomMargin = 240;
      const viewportH = window.innerHeight;
      const inView =
        initialRect.top >= topMargin &&
        initialRect.bottom <= viewportH - bottomMargin;

      if (inView) {
        setRect(initialRect);
        setSearching(false);
        return;
      }

      // Scrollear con block:"center" para dejarlo a media pantalla. Después
      // del scroll suave (~380ms), re-medir para coordenadas finales.
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        setRect(r);
        setSearching(false);
      }, 420);
    };

    const initial = findEl();
    if (initial) {
      measure(initial);
      return () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    let attempts = 0;
    const interval = setInterval(() => {
      const el = findEl();
      if (el) {
        clearInterval(interval);
        measure(el);
      } else if (++attempts > 53) {
        // 8s sin encontrar — paramos y mostramos fallback estático.
        clearInterval(interval);
        if (!cancelled) setSearching(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // Solo queremos que este effect corra una vez por mount. La key del
    // SpotlightOverlay garantiza remount al cambiar selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-medir si el viewport cambia (rotación, teclado iOS, scroll del user).
  // Sin esto, si algo mueve el botón después de fijar rect, el spotlight
  // queda desincronizado.
  useEffect(() => {
    if (!rect) return;
    const update = () => {
      const el = findEl();
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [rect, findEl]);

  if (!rect) {
    // Elemento no encontrado (aún o ya desistimos). Mostramos card flotante
    // con la explicación. CRÍTICO: el botón hace `onDone` siempre — nunca
    // `onNext` — para que NO avance al siguiente highlight sin haber visto
    // nada. Si el user no puede ver el spotlight, vuelve a la card del paso
    // y desde ahí decide continuar al paso siguiente.
    return (
      <div className="fixed inset-0 z-[210]" style={{background:"rgba(0,0,0,0.55)",animation:"tourFadeIn 0.3s ease-out"}}>
        <div className="absolute left-0 right-0 bottom-8 px-6 flex justify-center pointer-events-none">
          <div className="bg-card rounded-2xl p-5 max-w-xs text-center shadow-2xl pointer-events-auto border border-border" style={{animation:"tourScaleIn 0.4s cubic-bezier(0.16,1,0.3,1)"}}>
            {searching ? (
              <>
                <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center" style={{background:`${stepColor}20`}}>
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent" style={{borderColor:`${stepColor} transparent ${stepColor} ${stepColor}`,animation:"tourSpotlight 1s linear infinite"}}/>
                </div>
                <h3 className="text-base font-bold mb-2">{t(highlight.titleKey)}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t(highlight.descKey)}</p>
                <button disabled
                  className="w-full py-3 rounded-xl text-white/70 font-semibold text-sm cursor-wait"
                  style={{background:`${stepColor}80`}}>
                  {t("tourGotIt")}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold mb-2">{t(highlight.titleKey)}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t(highlight.descKey)}</p>
                <button onClick={onDone}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm"
                  style={{background:stepColor}}>
                  {t("tourGotIt")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const padding = 8;
  const spotTop = rect.top - padding;
  const spotLeft = rect.left - padding;
  const spotW = rect.width + padding * 2;
  const spotH = rect.height + padding * 2;
  const isAbove = highlight.position === "above" || rect.top > window.innerHeight * 0.6;
  const tooltipTop = isAbove ? spotTop - 12 : spotTop + spotH + 12;

  return (
    <div className="fixed inset-0 z-[210]" style={{animation:"tourFadeIn 0.2s ease-out"}}>
      {/* Dark mask with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{pointerEvents:"auto"}}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white"/>
            <rect x={spotLeft} y={spotTop} width={spotW} height={spotH} rx={12} fill="black"/>
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.75)" mask="url(#tour-mask)"/>
      </svg>

      {/* Spotlight ring around element */}
      <div className="absolute" style={{
        top: spotTop, left: spotLeft, width: spotW, height: spotH,
        borderRadius: 12, pointerEvents: "none",
        animation: "tourSpotlight 2s ease-in-out infinite",
      }}/>

      {/* Arrow */}
      <div className="absolute" style={{
        left: spotLeft + spotW / 2 - 12,
        top: isAbove ? spotTop - 32 : spotTop + spotH + 4,
        pointerEvents: "none",
        animation: "tourArrowBounce 1.5s ease-in-out infinite",
      }}>
        <ArrowDown size={24} style={{
          color: stepColor,
          transform: isAbove ? "rotate(180deg)" : "none",
        }}/>
      </div>

      {/* Tooltip */}
      <div ref={tooltipRef} className="absolute px-4" style={{
        top: isAbove ? "auto" : tooltipTop,
        bottom: isAbove ? window.innerHeight - spotTop + 20 : "auto",
        left: 0, right: 0,
        pointerEvents: "auto",
        animation: "tourSlideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div className="max-w-sm mx-auto rounded-2xl p-4"
          style={{background:"rgba(26,26,26,0.95)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <h3 className="text-sm font-bold text-white mb-1">{t(highlight.titleKey)}</h3>
          <p className="text-xs text-white/50 leading-relaxed mb-3">{t(highlight.descKey)}</p>
          <button onClick={isLast ? onDone : onNext}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-xs active:scale-95 transition-transform"
            style={{background:stepColor}}>
            {isLast ? t("tourGotIt") : t("tourNextElement")} <ChevronRight size={14} className="inline"/>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Tour ─── */
export function AppTour({ onDismiss }: { onDismiss: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<"intro" | "navigating" | "showing" | "highlighting" | "complete">("intro");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [highlightsSeen, setHighlightsSeen] = useState(false);
  const [hasData, setHasData] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const Icon = step?.icon ?? Wallet;
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const total = TOUR_STEPS.length;

  // Check if user has any transactions (to conditionally show insights copy)
  useEffect(() => {
    apiFetch("/api/transactions?limit=1")
      .then((r) => r.json())
      .then((data) => {
        const count = Array.isArray(data) ? data.length : (data?.transactions?.length ?? 0);
        setHasData(count > 0);
      })
      .catch(() => {});
  }, []);

  // Polling instead of fixed 700ms timer — wait for spotlight target to appear in DOM.
  // Ruta /insights tarda en montar su botón generate (fetch + skeleton), así que
  // extendemos a 30 intentos (6s) en vez de 15 (3s). Steps card-only (sin
  // highlights) saltan al "showing" sin esperar.
  // Cuando encontramos el target lo scrolleamos a la vista — así la card del
  // paso aparece con el botón ya visible y el user entiende a qué apunta el
  // "Ver cómo usar".
  useEffect(() => {
    if (phase !== "navigating") return;
    router.push(step.route);
    const target = step.highlights[0]?.selector;
    if (!target) {
      setPhase("showing");
      return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
      const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null;
      if (el) {
        clearInterval(interval);
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          el.scrollIntoView();
        }
        setPhase("showing");
      } else if (attempts++ > 30) {
        clearInterval(interval);
        setPhase("showing");
      }
    }, 200);
    return () => clearInterval(interval);
  }, [phase, step?.route, router, step?.highlights]);

  // Auto-start after intro
  useEffect(() => {
    if (phase === "intro") {
      const timer = setTimeout(() => {}, 0); // user clicks to start
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleNext = useCallback(() => {
    if (isLast) {
      setPhase("complete");
      setShowConfetti(true);
      setTimeout(() => { router.push("/dashboard"); onDismiss(); }, 3000);
    } else {
      setCurrentStep(prev => prev + 1);
      setHighlightIdx(0);
      setHighlightsSeen(false);
      setPhase("navigating");
    }
  }, [isLast, router, onDismiss]);

  const handleTryNow = useCallback(() => {
    setHighlightIdx(0);
    setPhase("highlighting");
  }, []);

  const handleNextHighlight = useCallback(() => {
    const maxIdx = step.highlights.length - 1;
    if (highlightIdx < maxIdx) {
      setHighlightIdx(prev => prev + 1);
    }
  }, [highlightIdx, step?.highlights.length]);

  const handleHighlightDone = useCallback(() => {
    setHighlightsSeen(true);
    setPhase("showing");
  }, []);

  const handleSkip = useCallback(() => {
    router.push("/dashboard");
    onDismiss();
  }, [router, onDismiss]);

  // Intercept native back gesture during SHOWING phase to prevent breaking the tour
  useEffect(() => {
    if (phase !== "showing") return;
    window.history.pushState(null, "", window.location.href);
    const handler = () => handleSkip();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [phase, handleSkip]);

  /* ─── INTRO ─── */
  if (phase === "intro") {
    return (
      <>
        <style>{STYLES}</style>
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{background:"rgba(0,0,0,0.9)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",animation:"tourFadeIn 0.4s ease-out"}}>
          <div className="w-full max-w-sm flex flex-col items-center text-center gap-6" style={{animation:"tourScaleIn 0.5s cubic-bezier(0.16,1,0.3,1)"}}>
            <div className="relative">
              <div className="absolute inset-[-16px] rounded-[32px]" style={{background:step.iconBg,filter:"blur(30px)",opacity:0.25}}/>
              <div className="relative w-24 h-24 rounded-3xl bg-[#2D6A4F] flex items-center justify-center"
                style={{boxShadow:"0 20px 60px rgba(45,106,79,0.5)"}}>
                <PartyPopper size={44} className="text-white" style={{animation:"tourBounce 2s ease-in-out infinite"}}/>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white mb-2">{t("tourWelcomeTitle")}</h1>
              <p className="text-base text-white/50 leading-relaxed">{t("tourWelcomeDesc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 w-full">
              {TOUR_STEPS.map((s,i)=>{
                const I=s.icon;
                return(
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl p-3" style={{backgroundColor:s.iconBg+"18",border:`1px solid ${s.iconBg}30`,animation:`tourScaleIn 0.4s cubic-bezier(0.16,1,0.3,1) ${0.3+i*0.1}s both`}}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:s.iconBg}}>
                      <I size={20} className="text-white"/>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-white/30 font-medium">{s.number}</span>
                      <span className="text-xs text-white font-semibold leading-tight">{t(s.titleKey)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={()=>setPhase("navigating")}
              className="w-full py-4 rounded-2xl bg-[#2D6A4F] text-white font-bold text-base active:scale-95 transition-transform"
              style={{boxShadow:"0 10px 40px rgba(45,106,79,0.4)"}}>
              {t("tourStart")} <ArrowRight size={18} className="inline ml-1"/>
            </button>
            <button onClick={handleSkip} className="text-sm text-white/50 hover:text-white/70 transition-colors">
              {t("skipTour")}
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ─── COMPLETE ─── */
  if (phase === "complete") {
    return (
      <>
        <style>{STYLES}</style>
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{background:"rgba(0,0,0,0.9)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",animation:"tourFadeIn 0.3s ease-out"}}>
          {showConfetti && <Confetti/>}
          <div className="w-full max-w-sm flex flex-col items-center text-center gap-6" style={{animation:"tourScaleIn 0.5s cubic-bezier(0.16,1,0.3,1)"}}>
            <div className="w-24 h-24 rounded-full bg-[#2D6A4F] flex items-center justify-center" style={{boxShadow:"0 20px 60px rgba(45,106,79,0.5)"}}>
              <Check size={48} className="text-white" strokeWidth={3}/>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white mb-2">{t("tourCompleteTitle")}</h1>
              <p className="text-base text-white/50 leading-relaxed">{t("tourCompleteDesc")}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ─── NAVIGATING ─── */
  if (phase === "navigating") {
    return (
      <>
        <style>{STYLES}</style>
        <div className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",animation:"tourFadeIn 0.2s ease-out"}}>
          <div className="flex flex-col items-center gap-4" style={{animation:"tourScaleIn 0.3s cubic-bezier(0.16,1,0.3,1)"}}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{backgroundColor:step.iconBg}}>
              <Icon size={28} className="text-white" style={{animation:"tourBounce 1.5s ease-in-out infinite"}}/>
            </div>
            <p className="text-sm font-medium text-white/70">{t("tourStep")} {step.number} {t("of")} {total}</p>
          </div>
        </div>
      </>
    );
  }

  /* ─── HIGHLIGHTING (sub-tour: spotlighting individual elements) ─── */
  if (phase === "highlighting" && step.highlights.length > 0) {
    const hl = step.highlights[highlightIdx];
    return (
      <>
        <style>{STYLES}</style>
        <SpotlightOverlay
          // key fuerza remount al cambiar de highlight: reinicia el state
          // local (rect, searching) y vuelve a buscar el nuevo elemento sin
          // arrastrar el rect viejo.
          key={`${step.id}-${highlightIdx}`}
          highlight={hl}
          stepColor={step.iconBg}
          onNext={handleNextHighlight}
          onDone={handleHighlightDone}
          isLast={highlightIdx === step.highlights.length - 1}
          t={t}
        />
      </>
    );
  }

  /* ─── SHOWING (main card) ─── */
  return (
    <>
      <style>{STYLES}</style>
      <div className="fixed inset-0 z-[200]" style={{pointerEvents:"none"}}>
        {/* Overlay */}
        <div className="absolute inset-0" style={{
          background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",
          pointerEvents:"auto",animation:"tourFadeIn 0.3s ease-out",
        }}/>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10" style={{pointerEvents:"auto",animation:"tourSlideDown 0.4s ease-out 0.1s both"}}>
          <div className="pt-[env(safe-area-inset-top,12px)] px-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{backgroundColor:step.iconBg}}>
                  <Icon size={16} className="text-white"/>
                </div>
                <span className="text-xs font-semibold text-white/50 tracking-wider">
                  {t("tourStep")} {step.number} {t("of")} {total}
                </span>
              </div>
              <button onClick={handleSkip} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
                <X size={14} className="text-white/50"/>
              </button>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 ease-out"
                style={{width:`${(step.number/total)*100}%`,background:`linear-gradient(90deg,${step.iconBg},${step.iconBg}cc)`}}/>
            </div>
            <div className="flex justify-center gap-2 mt-3">
              {TOUR_STEPS.map((s,i)=>(
                <div key={s.id} className="h-1.5 rounded-full transition-all duration-500"
                  style={{width:i===currentStep?24:6,backgroundColor:i<=currentStep?step.iconBg:"rgba(255,255,255,0.12)"}}/>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom card */}
        <div className="absolute bottom-0 left-0 right-0 z-10" style={{pointerEvents:"auto",animation:"tourSlideUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.15s both"}}>
          <div className="mx-3 mb-[env(safe-area-inset-bottom,12px)]">
            <div className="rounded-3xl overflow-hidden"
              style={{background:"rgba(26,26,26,0.95)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.08)"}}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{backgroundColor:step.iconBg,boxShadow:`0 6px 20px ${step.iconBg}50`}}>
                    <Icon size={24} className="text-white"/>
                  </div>
                  <h2 className="text-xl font-extrabold text-white leading-tight">{t(step.titleKey)}</h2>
                </div>
                <p className="text-sm text-white/50 leading-relaxed mb-5">
                  {step.emptyDescKey && !hasData ? t(step.emptyDescKey) : t(step.descKey)}
                </p>
                <div className="flex flex-col gap-2">
                  {step.highlights.length > 0 && !highlightsSeen && (
                    <button onClick={handleTryNow}
                      className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                      style={{background:step.iconBg,boxShadow:`0 8px 24px ${step.iconBg}40`}}>
                      {t("tourSeeHowToUse")}
                    </button>
                  )}
                  {(() => {
                    // Steps sin highlights (card-only) tratan el "Siguiente"
                    // como activo desde el inicio: no hay nada que "ver" antes.
                    const ready = highlightsSeen || step.highlights.length === 0;
                    return (
                      <button onClick={handleNext}
                        className="w-full py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-1 active:scale-95 transition-all"
                        style={{background: ready ? step.iconBg : "rgba(255,255,255,0.08)", color: ready ? "white" : "rgba(255,255,255,0.5)", boxShadow: ready ? `0 8px 24px ${step.iconBg}40` : "none"}}>
                        {isLast ? t("finishTour") : t("nextStep")} <ChevronRight size={16}/>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
