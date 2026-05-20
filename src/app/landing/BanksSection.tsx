"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { SUPPORTED_BANKS, FEATURED_BANKS } from "@/components/bank-logos";
import { ShieldCheck, WifiOff, KeyRound, EyeOff } from "lucide-react";
import type { Translations } from "@/i18n";

const EASE = [0.16, 1, 0.3, 1] as const;

const FEATURED = SUPPORTED_BANKS.filter((b) =>
  (FEATURED_BANKS as readonly string[]).includes(b.slug)
);

export default function BanksSection({ t }: { t: Translations }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const isES = t.hero.headline.includes("gastos");

  const trustPoints = isES
    ? [
        { icon: <WifiOff size={16} />, text: "No nos conectamos a tu banco" },
        { icon: <KeyRound size={16} />, text: "Nunca pedimos tus credenciales" },
        { icon: <EyeOff size={16} />, text: "Ni nosotros podemos ver tu información bancaria" },
        { icon: <ShieldCheck size={16} />, text: "Solo extraemos la información necesaria: fecha, concepto e importe" },
      ]
    : [
        { icon: <WifiOff size={16} />, text: "We never connect to your bank" },
        { icon: <KeyRound size={16} />, text: "We never ask for your credentials" },
        { icon: <EyeOff size={16} />, text: "Not even we can see your banking information" },
        { icon: <ShieldCheck size={16} />, text: "We only extract what's needed: date, description, and amount" },
      ];

  return (
    <section ref={ref} className="py-14 sm:py-20 px-5 sm:px-8 border-t border-[#E9ECEF]">
      <div className="mx-auto max-w-4xl text-center">
        <motion.p
          className="text-[#2D6A4F] text-xs font-semibold tracking-[0.2em] uppercase mb-3"
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {isES ? "Compatible con tu banco" : "Works with your bank"}
        </motion.p>
        <motion.h2
          className="text-xl sm:text-2xl font-bold tracking-tight text-[#1A1A1A] mb-3"
          initial={{ opacity: 0, y: 15 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
        >
          {isES
            ? "Importa desde cualquier banco"
            : "Import from any bank"}
        </motion.h2>
        <motion.p
          className="text-sm text-[#888888] mb-8 max-w-md mx-auto"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {isES
            ? "Descarga el extracto desde tu banco y súbelo a fintrk. Sin conexiones bancarias, sin riesgos."
            : "Download your statement from your bank and upload it to fintrk. No bank connections, no risk."}
        </motion.p>

        {/* Bank logos grid — 5 featured banks */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 mb-10">
          {FEATURED.map((bank, i) => (
            <motion.div
              key={bank.slug}
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: EASE }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/banks/${bank.slug}.png`}
                alt={bank.name}
                width={48}
                height={48}
                className="rounded-xl"
                loading="eager"
              />
              <span className="text-[11px] text-[#888888] font-medium">{bank.name}</span>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="text-xs text-[#888888] mb-8"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          {isES
            ? "CSV, Excel y PDF — detectamos el formato automáticamente. Y cualquier otro banco que exporte archivos."
            : "CSV, Excel & PDF — we detect the format automatically. Plus any other bank that exports files."}
        </motion.p>

        {/* Trust / privacy strip */}
        <motion.div
          className="rounded-2xl bg-[#E8F5EE] border border-[#2D6A4F]/10 p-5 sm:p-6 max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.6, ease: EASE }}
        >
          <div className="flex flex-col gap-3">
            {trustPoints.map((point, i) => (
              <div key={i} className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-lg bg-[#2D6A4F]/10 flex items-center justify-center text-[#2D6A4F] shrink-0">
                  {point.icon}
                </div>
                <span className="text-sm text-[#1A1A1A] font-medium">{point.text}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#888888] mt-4 leading-relaxed">
            {isES
              ? "fintrk no está afiliado con ninguno de estos bancos. Los logos se muestran únicamente para indicar compatibilidad de formatos. No accedemos, almacenamos ni transmitimos credenciales bancarias."
              : "fintrk is not affiliated with any of these banks. Logos are shown solely to indicate format compatibility. We do not access, store, or transmit banking credentials."}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
