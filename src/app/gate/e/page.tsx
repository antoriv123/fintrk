"use client";
import { apiFetch } from "@/lib/api";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { FintrkLogo } from "@/components/fintrk-logo";
import { useT } from "@/lib/i18n";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión");
        setLoading(false);
        return;
      }

      // Si el backend reporta que el usuario aún no completó onboarding
      // (nunca terminó el wizard y no tiene actividad), llevarlo allí.
      // En cualquier otro caso → dashboard. data.onboarded undefined se
      // trata como true para no romper sesiones legacy.
      const goToOnboarding = data.onboarded === false;
      router.push(goToOnboarding ? "/onboarding" : "/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <FintrkLogo size="lg" className="mb-4" />
          <p className="text-sm text-muted-foreground mt-1">{t("loginTitle")}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-expense text-sm">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] tracking-wide text-muted-foreground mb-1 block">
                  {t("email").toUpperCase()}
                </label>
                <Input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] tracking-wide text-muted-foreground mb-1 block">
                  {t("password").toUpperCase()}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? t("loginEntering") : t("loginButton")}
              </Button>
            </form>

          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {t("noAccount")}{" "}
          <Link href="/gate/n" className="text-primary hover:underline font-medium">
            {t("createAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
