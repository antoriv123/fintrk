"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV, MORE_ITEMS } from "@/lib/navigation";
import { NavIcon } from "@/components/nav-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield } from "lucide-react";
import { FintrkLogo } from "@/components/fintrk-logo";
import { useT } from "@/lib/i18n";
import useSWR from "swr";
import type { NavItem } from "@/lib/navigation";

function NavButton({ item, pathname }: { item: NavItem; pathname: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn("justify-start gap-2.5 h-9", active && "font-medium text-primary")}
      asChild
    >
      <Link href={item.href}>
        <NavIcon name={item.icon} size={16} />
        <span className="text-sm">{t(item.labelKey) || item.label}</span>
      </Link>
    </Button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] text-muted-foreground tracking-wide px-3 pt-4 pb-1">{label}</div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSWR<{ user: { role?: string } | null }>("/api/auth/session");
  const isAdmin = session?.user?.role === "admin";

  const manageItems = MORE_ITEMS.filter((item) => item.section === "manage" && (!item.adminOnly || isAdmin));
  const reportItems = MORE_ITEMS.filter((item) => item.section === "reports" && (!item.adminOnly || isAdmin));
  const intelItems = MORE_ITEMS.filter((item) => item.section === "intelligence" && (!item.adminOnly || isAdmin));
  const configItems = MORE_ITEMS.filter((item) => item.section === "config" && (!item.adminOnly || isAdmin));

  return (
    <aside className="hidden md:flex flex-col w-56 border-r border-border bg-sidebar h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <FintrkLogo size="md" />
        </Link>
      </div>
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-0.5 px-2">
          {MAIN_NAV.map((item) => (
            <NavButton key={item.href} item={item} pathname={pathname} />
          ))}

          {manageItems.length > 0 && (
            <>
              <SectionLabel label="GESTIONAR" />
              {manageItems.map((item) => (
                <NavButton key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}

          {reportItems.length > 0 && (
            <>
              <SectionLabel label="INFORMES" />
              {reportItems.map((item) => (
                <NavButton key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}

          {intelItems.length > 0 && (
            <>
              <SectionLabel label="ANALISIS" />
              {intelItems.map((item) => (
                <NavButton key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}

          {configItems.length > 0 && (
            <>
              <SectionLabel label="CONFIGURACION" />
              {configItems.map((item) => (
                <NavButton key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}

          {isAdmin && (
            <>
              <SectionLabel label="ADMIN" />
              <Button
                variant={pathname.startsWith("/admin") ? "secondary" : "ghost"}
                className={cn(
                  "justify-start gap-2.5 h-9",
                  pathname.startsWith("/admin") && "font-medium text-primary"
                )}
                asChild
              >
                <Link href="/admin">
                  <Shield size={16} />
                  <span className="text-sm">Admin</span>
                </Link>
              </Button>
            </>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
