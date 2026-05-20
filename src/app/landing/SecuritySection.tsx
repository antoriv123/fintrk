"use client";

import { useRef } from "react";
import type { Translations } from "@/i18n";
import { FadeIn } from "./animations";
import { Lock, EyeOff, ShieldCheck, KeyRound } from "lucide-react";
import { motion, useInView } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

function SecurityCard({
  icon,
  title,
  description,
  index,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className="group rounded-2xl bg-white border border-[#E9ECEF] p-6 sm:p-7 transition-all duration-300 hover:border-[#2D6A4F]/30 hover:shadow-sm"
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ delay: index * 0.15, duration: 0.7, ease: EASE }}
    >
      <motion.div
        className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#E8F5EE] text-[#2D6A4F]"
        initial={{ scale: 0, rotate: -20 }}
        animate={isInView ? { scale: 1, rotate: 0 } : {}}
        transition={{ delay: 0.2 + index * 0.15, duration: 0.5, ease: EASE }}
      >
        {icon}
      </motion.div>
      <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">{title}</h3>
      <p className="text-xs text-[#888888] leading-relaxed">{description}</p>
    </motion.div>
  );
}

export default function SecuritySection({ t }: { t: Translations }) {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-5 sm:px-8 border-t border-[#E9ECEF]">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="text-center max-w-lg mx-auto mb-12">
            <p className="text-[#2D6A4F] text-xs font-semibold tracking-[0.2em] uppercase mb-3">
              {t.hero.badgeEncrypted}
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#1A1A1A]">
              {t.security.title}
            </h2>
          </div>
        </FadeIn>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SecurityCard icon={<KeyRound size={18} />} title={t.security.noBankConnect} description={t.security.noBankConnectDesc} index={0} />
          <SecurityCard icon={<Lock size={18} />} title={t.security.encryption} description={t.security.encryptionDesc} index={1} />
          <SecurityCard icon={<EyeOff size={18} />} title={t.security.ai} description={t.security.aiDesc} index={2} />
          <SecurityCard icon={<ShieldCheck size={18} />} title={t.security.gdpr} description={t.security.gdprDesc} index={3} />
        </div>
      </div>
    </section>
  );
}
