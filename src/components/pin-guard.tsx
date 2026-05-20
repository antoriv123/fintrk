"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";

export function PinGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "locked" | "unlocked" | "no-pin">("loading");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.hasPin) {
          setState("no-pin");
        } else {
          apiFetch("/api/auth/session")
            .then((r) => r.json())
            .then((s) => setState(s.valid ? "unlocked" : "locked"))
            .catch(() => setState("locked"));
        }
      });
  }, []);

  async function verify() {
    setError("");
    const res = await apiFetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin }),
    });
    const data = await res.json();
    if (data.valid) {
      setState("unlocked");
    } else {
      setError(data.error ?? "PIN incorrecto");
      setPin("");
    }
  }

  if (state === "loading") return null;
  if (state === "unlocked" || state === "no-pin") return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Lock size={28} className="text-primary" />
      </div>
      <Card className="w-full max-w-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-center text-lg">Finance Tracker</CardTitle>
          <p className="text-center text-sm text-muted-foreground">Introduce tu PIN</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="----"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            autoFocus
            className="text-center text-2xl tracking-[0.5em] h-14"
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button className="w-full h-12 text-base" onClick={verify} disabled={pin.length < 4}>
            Desbloquear
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
