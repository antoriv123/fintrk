"use client";
import { apiFetch } from "@/lib/api";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ArrowRight } from "lucide-react";
import type { Translations } from "@/i18n";

export function WaitlistForm({ t }: { t: Translations }) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (honeypot) {
      setStatus("success");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await apiFetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error al registrar");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="inline-flex items-center gap-3 rounded-xl bg-[#E8F5EE] border border-[#2D6A4F]/20 px-6 py-3.5 text-sm font-semibold text-[#2D6A4F]">
        <CheckCircle2 size={18} />
        {t.hero.success}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, width: 0 }}
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
        placeholder={t.hero.emailPlaceholder}
        className="w-full sm:flex-1 rounded-xl border border-[#E9ECEF] bg-white px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#888888]/50 focus:border-[#2D6A4F] focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]/30 transition-all"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-xl bg-[#2D6A4F] px-6 py-3 text-sm font-semibold text-white hover:bg-[#245A42] active:scale-[0.98] disabled:opacity-60 transition-all"
      >
        {status === "loading" ? t.hero.sending : t.hero.joinWaitlist}
        {status !== "loading" && <ArrowRight size={15} />}
      </button>
      {status === "error" && <p className="text-xs text-[#EF4444]">{errorMsg}</p>}
    </form>
  );
}

export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-5 text-left transition-colors group"
      >
        <span className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#2D6A4F] transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          size={16}
          className={`text-[#888888] transition-transform duration-300 flex-shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm text-[#888888] leading-relaxed">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
