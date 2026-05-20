"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Smartphone, Check, ExternalLink, RefreshCw, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AutomationWalkthrough } from "@/components/apple-pay-walkthrough";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const SHORTCUT_URL = process.env.NEXT_PUBLIC_APPLE_PAY_SHORTCUT_URL || "";

interface Status {
  has_active_token: boolean;
  step1_installed: boolean;
  step2_automated: boolean;
  step3_verified: boolean;
  imports_30d: number;
  last_import_at: string | null;
  all_done: boolean;
}

interface TokenRow {
  id: number;
  token_preview: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function ApplePaySettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pollingStep3, setPollingStep3] = useState(false);
  const [showAutomationGuide, setShowAutomationGuide] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        apiFetch("/api/account/apple-pay-status"),
        apiFetch("/api/account/apple-pay-tokens"),
      ]);
      if (!sRes.ok || !tRes.ok) throw new Error();
      const s: Status = await sRes.json();
      const t: { tokens: TokenRow[] } = await tRes.json();
      setStatus(s);
      setTokens(t.tokens);
    } catch {
      toast.error("No se pudo cargar el estado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Poll every 5s while waiting for step 3 verification
  useEffect(() => {
    if (!pollingStep3) return;
    const interval = setInterval(() => { reload(); }, 5000);
    return () => clearInterval(interval);
  }, [pollingStep3, reload]);

  useEffect(() => {
    if (status?.step3_verified && pollingStep3) {
      setPollingStep3(false);
      toast.success("Apple Pay conectado. Ya puedes olvidarte.", { duration: 5000 });
    }
  }, [status?.step3_verified, pollingStep3]);

  async function markStep(step: "step1_installed" | "step2_automated", value = true) {
    try {
      await apiFetch("/api/account/apple-pay-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, value }),
      });
      reload();
    } catch { /* silent */ }
  }

  async function handleInstallShortcut() {
    setGenerating(true);
    try {
      // 1. Ensure the user has a token. If not, create one silently.
      let token: string | null = null;
      if (!status?.has_active_token) {
        const res = await apiFetch("/api/account/apple-pay-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "iPhone" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "No se pudo generar token");
        }
        const data: { token: string } = await res.json();
        token = data.token;
      } else {
        // Token already exists; user is reinstalling. Issue a fresh one for the new install.
        const res = await apiFetch("/api/account/apple-pay-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "iPhone" }),
        });
        if (res.ok) {
          const data: { token: string } = await res.json();
          token = data.token;
        }
      }

      // 2. Copy to clipboard so user can paste in Shortcuts import question.
      if (token) {
        try {
          await navigator.clipboard.writeText(token);
          toast.success("Token copiado. Pega cuando Atajos lo pida.", { duration: 6000 });
        } catch {
          // Clipboard may be unavailable on older WebKit; fall back to showing it.
          toast("Copia tu token manualmente en la siguiente pantalla.", { duration: 8000 });
        }
      }

      // 3. Mark step 1 as installed optimistically.
      await markStep("step1_installed", true);

      // 4. Open iCloud shortcut URL (iOS will open Shortcuts app).
      if (SHORTCUT_URL) {
        // Small delay so the toast is visible and clipboard gets flushed before navigation.
        setTimeout(() => { window.location.href = SHORTCUT_URL; }, 500);
      } else {
        toast.error("Link del shortcut no configurado todavia. Avisa a soporte.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setGenerating(false);
    }
  }

  function handleOpenAutomation() {
    setShowAutomationGuide(true);
  }

  function handleConfirmAutomation() {
    markStep("step2_automated", true);
    setShowAutomationGuide(false);
    setPollingStep3(true);
    toast.success("Perfecto. Haz una compra pequena con Apple Pay para verificar.", { duration: 6000 });
  }

  async function revokeToken(id: number) {
    if (!confirm("Revocar este token? El shortcut dejara de funcionar hasta que generes otro.")) return;
    try {
      await apiFetch(`/api/account/apple-pay-tokens/${id}`, { method: "DELETE" });
      toast.success("Token revocado");
      reload();
    } catch {
      toast.error("No se pudo revocar");
    }
  }

  const step1Done = !!status?.step1_installed && !!status?.has_active_token;
  const step2Done = !!status?.step2_automated;
  const step3Done = !!status?.step3_verified;
  const allDone = step1Done && step2Done && step3Done;
  const activeTokens = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 rounded-lg hover:bg-muted"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-semibold">Apple Pay</h1>
          {pollingStep3 && !step3Done && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" />
              Esperando compra...
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-24">
        {/* Hero */}
        <div className="text-center py-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Smartphone size={26} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-1">
            {allDone ? "Conectado" : "Conectar Apple Pay"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {allDone
              ? "Cada Apple Pay se apunta y categoriza en Fintrk automaticamente."
              : "En 60 segundos, tu Fintrk registrara cada compra con Apple Pay sin tocar la app."
            }
          </p>
        </div>

        {loading ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Cargando...</CardContent></Card>
        ) : allDone ? (
          <ConnectedState
            imports30d={status?.imports_30d ?? 0}
            lastImportAt={status?.last_import_at ?? null}
            onShowAdvanced={() => setShowAdvanced((v) => !v)}
            showAdvanced={showAdvanced}
            tokens={activeTokens}
            onRevoke={revokeToken}
          />
        ) : (
          <div className="space-y-3">
            <StepCard
              number={1}
              title="Instala el shortcut"
              description={
                step1Done
                  ? "Shortcut instalado"
                  : "Generamos tu token, lo copiamos al portapapeles y abrimos Atajos. Solo tienes que pegar."
              }
              done={step1Done}
              action={
                !step1Done ? (
                  <Button
                    onClick={handleInstallShortcut}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating ? "Abriendo Atajos..." : SHORTCUT_URL ? "Instalar shortcut" : "Preparando..."}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleInstallShortcut}>
                    Reinstalar
                  </Button>
                )
              }
            />

            <StepCard
              number={2}
              title="Crea la automatizacion"
              description={
                step2Done
                  ? "Automatizacion creada"
                  : "Una vez (te lleva 30 segundos). iOS te obliga a hacerlo tu — Apple no deja que nosotros lo hagamos por ti."
              }
              done={step2Done}
              disabled={!step1Done}
              action={
                !step2Done ? (
                  <Button
                    onClick={handleOpenAutomation}
                    disabled={!step1Done}
                    className="w-full"
                    variant={step1Done ? "default" : "outline"}
                  >
                    Ver como se hace
                  </Button>
                ) : null
              }
            />

            <StepCard
              number={3}
              title="Haz una compra de prueba"
              description={
                step3Done
                  ? "Verificado"
                  : pollingStep3
                  ? "Esperando tu primera compra con Apple Pay. La veras aparecer aqui."
                  : "Una vez creada la automatizacion, compra algo pequeno (un cafe) para comprobar que todo funciona."
              }
              done={step3Done}
              disabled={!step2Done}
              action={
                !step3Done && step2Done && !pollingStep3 ? (
                  <Button onClick={() => setPollingStep3(true)} variant="outline" className="w-full">
                    Estoy listo para probar
                  </Button>
                ) : null
              }
            />
          </div>
        )}

        {/* Privacy / trust */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <b className="text-foreground">Solo importe, comercio y fecha.</b> No vemos tu banco ni datos de tarjeta. Solo los ultimos 4 digitos (si iOS los da).
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <b className="text-foreground">Revocable en 1 tap.</b> Si cambias de opinion, el shortcut deja de funcionar al instante.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automation walkthrough modal */}
      <Dialog open={showAutomationGuide} onOpenChange={setShowAutomationGuide}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea la automatizacion</DialogTitle>
            <DialogDescription>
              30 segundos. Sigue exactamente estos pasos en la app Atajos.
            </DialogDescription>
          </DialogHeader>
          <AutomationWalkthrough />
          <div className="flex flex-col gap-2 mt-4">
            <Button
              onClick={() => {
                // Deep link to Shortcuts Automation tab
                window.location.href = "shortcuts://";
              }}
              className="w-full"
            >
              Abrir Atajos ahora <ExternalLink size={14} className="ml-1" />
            </Button>
            <Button variant="outline" onClick={handleConfirmAutomation}>
              Ya la cree
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Step card ─────────────────────────────────────────────────────────

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  done: boolean;
  disabled?: boolean;
  action: React.ReactNode;
}

function StepCard({ number, title, description, done, disabled, action }: StepCardProps) {
  return (
    <Card className={disabled ? "opacity-50" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            done ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}>
            {done ? <Check size={16} /> : <span className="text-xs font-bold">{number}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</div>
          </div>
          {done && <div className="text-xs text-primary font-medium">Hecho</div>}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Connected state ───────────────────────────────────────────────────

interface ConnectedStateProps {
  imports30d: number;
  lastImportAt: string | null;
  onShowAdvanced: () => void;
  showAdvanced: boolean;
  tokens: TokenRow[];
  onRevoke: (id: number) => void;
}

function ConnectedState({ imports30d, lastImportAt, onShowAdvanced, showAdvanced, tokens, onRevoke }: ConnectedStateProps) {
  return (
    <>
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-primary" />
          </div>
          <div className="text-2xl font-bold">{imports30d}</div>
          <div className="text-xs text-muted-foreground">
            compras registradas en los ultimos 30 dias
          </div>
          {lastImportAt && (
            <div className="text-xs text-muted-foreground mt-2">
              Ultima: {timeAgo(lastImportAt)}
            </div>
          )}
        </CardContent>
      </Card>

      <button
        onClick={onShowAdvanced}
        className="w-full text-xs text-muted-foreground underline hover:text-foreground text-center"
      >
        {showAdvanced ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
      </button>

      {showAdvanced && (
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {tokens.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                <ShieldCheck size={16} className="text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{t.token_preview}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Ultimo uso: {timeAgo(t.last_used_at)}
                  </div>
                </div>
                <button
                  onClick={() => onRevoke(t.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  aria-label="Revocar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {tokens.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Sin tokens activos</div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

