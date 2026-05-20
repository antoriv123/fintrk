"use client";

import { useFetch } from "@/hooks/use-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleCode } from "@/lib/i18n";
import type { BalancesResponse, AccountBalance } from "@/lib/api-types";

function fmtBalance(n: number, localeCode: string): string {
  return `€${n.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TotalCard({ total, localeCode }: { total: number; localeCode: string }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl p-3 sm:p-4 min-w-[120px] sm:min-w-[140px] border bg-card snap-start"
      style={{ borderLeft: "3px solid #3b82f6" }}
    >
      <div className="text-muted-foreground text-[10px] tracking-wide mb-1 sm:mb-2">TOTAL</div>
      <div className="text-lg sm:text-2xl font-bold">{fmtBalance(total, localeCode)}</div>
      <div className="text-muted-foreground text-[10px] mt-1">todas las cuentas</div>
    </div>
  );
}

function AccountCard({ account, localeCode }: { account: AccountBalance; localeCode: string }) {
  const isPositive = account.balance >= 0;
  return (
    <div
      className="flex-shrink-0 rounded-xl p-3 sm:p-4 min-w-[110px] sm:min-w-[130px] border bg-card snap-start"
      style={{ borderLeft: `3px solid ${account.color}` }}
    >
      <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: account.color }}
        >
          {account.name.charAt(0).toUpperCase()}
        </span>
        <span className="text-muted-foreground text-[10px] tracking-wide truncate max-w-[80px]">
          {account.name.toUpperCase()}
        </span>
      </div>
      <div className={`text-base sm:text-xl font-bold ${isPositive ? "text-foreground" : "text-expense"}`}>
        {fmtBalance(account.balance, localeCode)}
      </div>
    </div>
  );
}

function UnassignedCard({ amount, localeCode }: { amount: number; localeCode: string }) {
  return (
    <div
      className="flex-shrink-0 rounded-xl p-3 sm:p-4 min-w-[110px] sm:min-w-[130px] border bg-card snap-start"
      style={{ borderLeft: "3px solid #71717a" }}
    >
      <div className="text-muted-foreground text-[10px] tracking-wide mb-1 sm:mb-2">SIN CUENTA</div>
      <div className="text-base sm:text-xl font-bold text-muted-foreground">{fmtBalance(amount, localeCode)}</div>
    </div>
  );
}

export function AccountBalances() {
  const localeCode = useLocaleCode();
  const { data, loading } = useFetch<BalancesResponse>("/api/balances");

  if (loading) {
    return (
      <div className="mb-4">
        <Skeleton className="h-3 w-16 mb-2" />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex-shrink-0 min-w-[130px]">
              <CardContent className="p-4">
                <Skeleton className="h-2 w-16 mb-2" />
                <Skeleton className="h-7 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasAccounts = data.accounts.length > 0;
  const hasUnassigned = data.unassigned !== 0;

  if (!hasAccounts && !hasUnassigned) return null;

  return (
    <div className="mb-4">
      <div className="text-muted-foreground text-[10px] tracking-wide mb-2">CUENTAS</div>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x -mx-3 px-3 sm:mx-0 sm:px-0">
        <TotalCard total={data.total} localeCode={localeCode} />
        {data.accounts.map((account) => (
          <AccountCard key={account.slug} account={account} localeCode={localeCode} />
        ))}
        {hasUnassigned && <UnassignedCard amount={data.unassigned} localeCode={localeCode} />}
      </div>
    </div>
  );
}
