"use client";

import type { Translations } from "@/i18n";
import Link from "next/link";

export default function FooterSection({ t }: { t: Translations }) {
  return (
    <footer className="border-t border-[#E9ECEF] py-10 sm:py-12 px-5 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-1">
            <span className="font-display font-extrabold text-sm tracking-tight">
              <span className="text-[#1A1A1A]">fin</span><span className="text-[#2D6A4F]">trk</span>
            </span>
          </div>
          <div className="flex gap-6 text-xs text-[#888888]">
            <Link href="/privacy" className="hover:text-[#1A1A1A] transition-colors">
              {t.footer.privacy}
            </Link>
            <Link href="/terms" className="hover:text-[#1A1A1A] transition-colors">
              {t.footer.terms}
            </Link>
            <Link href="mailto:help@fintrk.app" className="hover:text-[#1A1A1A] transition-colors">
              {t.footer.contact}
            </Link>
          </div>
        </div>
        <div className="mt-6 text-[11px] text-[#888888]/40">
          &copy; {new Date().getFullYear()} Fintrk
        </div>
      </div>
    </footer>
  );
}
