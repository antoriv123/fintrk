"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CategoryCreate } from "@/components/category-create";

// Wrapper standalone para crear una categoria custom desde el panel
// "Completar primeros pasos". Reusa el mismo CategoryCreate del flujo
// de nuevo gasto, pero aqui se guarda directo (sin necesidad de
// asociarla a una transaccion).
export default function SetupCategoryPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("CircleDot");
  const [color, setColor] = useState("#2D6A4F");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [saving, setSaving] = useState(false);

  async function save() {
    const label = name.trim();
    if (!label) {
      const { toast } = await import("sonner");
      toast.error(t("writeCategoryName"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/custom-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, direction, icon, color }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const { toast } = await import("sonner");
        toast.error(data.error || "Error");
        setSaving(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      const { toast } = await import("sonner");
      toast.error("Error de conexion");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 px-4 pb-[env(safe-area-inset-bottom,16px)]">
        <div className="flex items-center gap-3 pt-4 pb-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 -ml-1 rounded-full hover:bg-muted/60 active:scale-95 transition-all flex items-center justify-center"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold leading-tight">
              {t("setupCategoryPageTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("setupCategoryPageSub")}
            </p>
          </div>
        </div>

        {/* Toggle gasto / ingreso */}
        <div className="flex gap-2 my-4">
          {(["expense", "income"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                direction === d
                  ? "bg-[#2D6A4F] text-white"
                  : "bg-muted/60 text-muted-foreground"
              }`}
            >
              {d === "expense" ? t("expense") : t("income")}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <CategoryCreate
            name={name}
            icon={icon}
            color={color}
            onName={setName}
            onIcon={setIcon}
            onColor={setColor}
            placeholder={t("writeCategoryName")}
            pickIconLabel={t("pickAnIcon")}
            pickColorLabel={t("pickAColor")}
          />
        </div>

        <Button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full mt-4"
          size="lg"
        >
          {saving ? t("setupSaving") : t("createCategory")}
        </Button>
      </div>
    </div>
  );
}
