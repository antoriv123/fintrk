"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback } from "react";
import { FetchError } from "@/components/fetch-error";
import { useFetch } from "@/hooks/use-fetch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp } from "lucide-react";
import { useT, useLocaleCode } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";

interface Position {
  id: number;
  ticker: string;
  name: string;
  asset_type: string;
  account: string | null;
  yahoo_ticker: string | null;
  price_date: string | null;
  total_shares: number;
  avg_cost: number;
  total_invested: number;
  current_price: number;
  current_value: number;
  pnl_eur: number;
  pnl_pct: number;
  weight: number;
  dividends_total: number;
}

interface Totals {
  total_invested: number;
  current_value: number;
  total_pnl_eur: number;
  total_pnl_pct: number;
  total_dividends: number;
  by_type: Record<string, number>;
}

interface PositionsData {
  positions: Position[];
  totals: Totals;
}

interface InvestmentTx {
  id: number;
  position_id: number;
  type: string;
  shares: number;
  price_per_share: number;
  currency: string;
  commission: number;
  date: string;
  notes: string | null;
  ticker: string;
  name: string;
}

interface TxData {
  transactions: InvestmentTx[];
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  etf: "ETF",
  stock: "Acción",
  crypto: "Crypto",
  index_fund: "Fondo Indexado",
  fund: "Fondo",
};

const ACCOUNT_OPTIONS = [
  "revolut",
  "ing",
  "n26",
  "wise",
  "myinvestor",
  "efectivo",
  "otro",
];

const TX_TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venta",
  dividend: "Dividendo",
};

function fmtInv(n: number, decimals = 2, localeCode = "es-ES"): string {
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlColor(value: number): string {
  if (value > 0) return "text-[#2D6A4F]";
  if (value < 0) return "text-red-400";
  return "text-muted-foreground";
}

export default function InvestmentsPage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt = (n: number, decimals = 2) => fmtInv(n, decimals, localeCode);
  const { data, refresh, error } = useFetch<PositionsData>("/api/investments/positions");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { positions, totals } = data;

  return (
    <div className="animate-in">
      <div className="text-muted-foreground text-xs tracking-wide mb-5">{t("investmentsTitle")}</div>

      {/* Dashboard header */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("totalValue")}</div>
            <div className="text-2xl font-bold text-foreground">{fmt(totals.current_value)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("totalPnl")}</div>
            <div className={`text-2xl font-bold ${pnlColor(totals.total_pnl_eur)}`}>
              {totals.total_pnl_eur >= 0 ? "+" : ""}{fmt(totals.total_pnl_eur)}
            </div>
            <div className={`text-xs ${pnlColor(totals.total_pnl_pct)}`}>
              {totals.total_pnl_pct >= 0 ? "+" : ""}{fmt(totals.total_pnl_pct)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("dividendsLabel")}</div>
            <div className="text-2xl font-bold text-foreground">{fmt(totals.total_dividends)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Asset allocation */}
      <AssetAllocation totals={totals} t={t as (key: string) => string} fmt={fmt} />

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button size="sm" onClick={() => setShowAddPosition(true)}>
          {t("addPosition")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAddTx(true)}>
          {t("registerOperation")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            setRefreshResult(null);
            try {
              const res = await apiFetch("/api/investments/prices/refresh", { method: "POST" });
              const data = await res.json();
              if (res.ok) {
                setRefreshResult(`${data.updated}/${data.total} ${t("pricesUpdated")}`);
                refresh();
              } else {
                setRefreshResult(data.error || t("errorRefreshingPrices"));
              }
            } catch {
              setRefreshResult(t("connectionError"));
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? t("refreshingPrices") : t("refreshPricesYahoo")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowPrices(true)}>
          {t("manualLabel")}
        </Button>
      </div>
      {refreshResult && (
        <div className="text-xs text-muted-foreground mb-4 bg-muted/50 rounded-lg px-3 py-2">
          {refreshResult}
        </div>
      )}

      {/* Positions table */}
      {positions.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={t("noInvestments")}
          description={t("noInvestmentsDesc")}
          tone="brand"
          cta={{ label: t("addFirstPosition"), onClick: () => setShowAddPosition(true) }}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fundLabel")}</TableHead>
                  <TableHead className="text-right">{t("unitsLabel")}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t("avgCostLabel")}</TableHead>
                  <TableHead className="text-right">{t("navLabel")}</TableHead>
                  <TableHead className="text-right">{t("valueLabel")}</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t("weightLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.id}
                    position={pos}
                    expanded={expandedId === pos.id}
                    onToggle={() => setExpandedId(expandedId === pos.id ? null : pos.id)}
                    onRefresh={refresh}
                    t={t as (key: string) => string}
                    fmt={fmt}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {positions.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t("totalInvested")}</span>
              <span className="text-sm font-semibold">{fmt(totals.total_invested)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-muted-foreground">{t("currentValueLabel")}</span>
              <span className="text-lg font-bold text-foreground">{fmt(totals.current_value)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <AddPositionDialog
        open={showAddPosition}
        onClose={() => setShowAddPosition(false)}
        onSaved={refresh}
      />
      <AddTransactionDialog
        open={showAddTx}
        onClose={() => setShowAddTx(false)}
        onSaved={refresh}
        positions={positions}
      />
      <UpdatePricesDialog
        open={showPrices}
        onClose={() => setShowPrices(false)}
        onSaved={refresh}
        positions={positions}
      />
    </div>
  );
}

/* ─── Asset Allocation ─── */

function AssetAllocation({ totals, t, fmt }: { totals: Totals; t: (key: string) => string; fmt: (n: number, d?: number) => string }) {
  const total = totals.current_value;
  if (total === 0) return null;

  const types = Object.entries(totals.by_type).filter(([, v]) => v > 0);
  if (types.length === 0) return null;

  const COLORS: Record<string, string> = {
    etf: "bg-primary",
    stock: "bg-[#2D6A4F]",
    crypto: "bg-amber-500",
    index_fund: "bg-[#0EA5E9]",
    fund: "bg-[#14B8A6]",
  };

  return (
    <div className="mb-6">
      <div className="text-muted-foreground text-[10px] tracking-wide mb-2">{t("distributionByType")}</div>
      <div className="flex h-3 rounded-full overflow-hidden mb-2">
        {types.map(([type, value]) => (
          <div
            key={type}
            className={COLORS[type] ?? "bg-zinc-500"}
            style={{ width: `${(value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap">
        {types.map(([type, value]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2.5 h-2.5 rounded-full ${COLORS[type] ?? "bg-zinc-500"}`} />
            <span className="text-muted-foreground">
              {ASSET_TYPE_LABELS[type] ?? type} {fmt((value / total) * 100, 1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Position Row ─── */

function PositionRow({
  position: pos,
  expanded,
  onToggle,
  onRefresh,
  t,
  fmt,
}: {
  position: Position;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  t: (key: string) => string;
  fmt: (n: number, d?: number) => string;
}) {
  const { data: txData } = useFetch<TxData>(
    expanded ? `/api/investments/transactions?position_id=${pos.id}` : null
  );

  const [showDeletePos, setShowDeletePos] = useState(false);
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);

  const handleDelete = useCallback(async () => {
    const res = await apiFetch(`/api/investments/positions/${pos.id}`, { method: "DELETE" });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorDeletingPosition")); return; }
    onRefresh();
  }, [pos.id, onRefresh, t]);

  const handleDeleteTx = useCallback(
    async (txId: number) => {
      const res = await apiFetch(`/api/investments/transactions/${txId}`, { method: "DELETE" });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorDeletingOperation")); return; }
      onRefresh();
    },
    [onRefresh, t]
  );

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell>
          <div className="font-semibold text-sm">{pos.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{pos.ticker}</div>
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {pos.total_shares > 0 ? fmt(pos.total_shares, 4) : "-"}
        </TableCell>
        <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
          {pos.avg_cost > 0 ? fmt(pos.avg_cost) : "-"}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          <div>{pos.current_price > 0 ? fmt(pos.current_price) : "-"}</div>
          {pos.price_date && (
            <div className="text-[9px] text-muted-foreground">{pos.price_date}</div>
          )}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {pos.current_value > 0 ? fmt(pos.current_value) : "-"}
        </TableCell>
        <TableCell className="text-right">
          <div className={`font-mono text-sm ${pnlColor(pos.pnl_eur)}`}>
            {pos.pnl_eur >= 0 ? "+" : ""}{fmt(pos.pnl_eur)}
          </div>
          <div className={`text-[10px] ${pnlColor(pos.pnl_pct)}`}>
            {pos.pnl_pct >= 0 ? "+" : ""}{fmt(pos.pnl_pct, 1)}%
          </div>
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
          {fmt(pos.weight, 1)}%
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-muted-foreground tracking-wide">
                {t("operationsOf")} {pos.ticker}
              </span>
              <Button size="sm" variant="destructive" onClick={() => setShowDeletePos(true)}>
                {t("deletePositionLabel")}
              </Button>
            </div>

            {pos.dividends_total > 0 && (
              <div className="text-xs text-[#2D6A4F] mb-2">
                {t("accumulatedDividends")} {fmt(pos.dividends_total)}
              </div>
            )}

            {!txData ? (
              <Skeleton className="h-16 w-full" />
            ) : txData.transactions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noOperations")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dateLabel")}</TableHead>
                    <TableHead>{t("typeColumn")}</TableHead>
                    <TableHead className="text-right">{t("unitsLabel")}</TableHead>
                    <TableHead className="text-right">{t("pricePerUnit")}</TableHead>
                    <TableHead className="text-right">{t("comissionColumn")}</TableHead>
                    <TableHead>{t("notesColumn")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txData.transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">{tx.date}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tx.type === "buy"
                              ? "default"
                              : tx.type === "sell"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {TX_TYPE_LABELS[tx.type] ?? tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {tx.type === "dividend" ? "-" : fmt(tx.shares, 4)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {fmt(tx.price_per_share)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {tx.commission > 0 ? fmt(tx.commission) : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {tx.notes ?? ""}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 w-11 p-0 text-red-400 hover:text-red-300"
                          aria-label={t("delete")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTxId(tx.id);
                          }}
                        >
                          ✕
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCell>
        </TableRow>
      )}
      <ConfirmDialog
        open={showDeletePos}
        onOpenChange={setShowDeletePos}
        title={`${t("delete")} ${pos.ticker}?`}
        description={t("deleteConfirmPositionDesc")}
        confirmLabel={t("delete")}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={deleteTxId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTxId(null); }}
        title={t("deleteOperationTitle")}
        description={t("cannotUndo")}
        confirmLabel={t("delete")}
        onConfirm={async () => { if (deleteTxId) await handleDeleteTx(deleteTxId); }}
      />
    </>
  );
}

/* ─── Add Position Dialog ─── */

function AddPositionDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("etf");
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!ticker || !name) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/investments/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          name,
          asset_type: assetType,
          account: account || null,
        }),
      });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorAddingPosition")); return; }
      setTicker("");
      setName("");
      setAssetType("etf");
      setAccount("");
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addPosition")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>{t("tickerLabel")}</Label>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="VWCE.DE"
            />
          </div>
          <div>
            <Label>{t("nameLabel")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vanguard FTSE All-World"
            />
          </div>
          <div>
            <Label>{t("assetTypeLabel")}</Label>
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="etf">ETF</SelectItem>
                <SelectItem value="stock">{t("stockLabel")}</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="index_fund">{t("indexFundLabel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("accountLabel")}</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectAccountOption")} />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !ticker || !name}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Transaction Dialog ─── */

function AddTransactionDialog({
  open,
  onClose,
  onSaved,
  positions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  positions: Position[];
}) {
  const t = useT();
  const [positionId, setPositionId] = useState("");
  const [type, setType] = useState("buy");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [commission, setCommission] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!positionId || !pricePerShare || !date) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/investments/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position_id: parseInt(positionId, 10),
          type,
          shares: type === "dividend" ? 0 : parseFloat(shares),
          price_per_share: parseFloat(pricePerShare),
          commission: commission ? parseFloat(commission) : 0,
          date,
          notes: notes || null,
        }),
      });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorRegisteringOperation")); return; }
      setPositionId("");
      setType("buy");
      setShares("");
      setPricePerShare("");
      setCommission("");
      setNotes("");
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const isDividend = type === "dividend";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("registerOperation")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label>{t("positionLabel")}</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectPositionOption")} />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.ticker} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">{t("buyLabel")}</SelectItem>
                <SelectItem value="sell">{t("sellLabel")}</SelectItem>
                <SelectItem value="dividend">{t("dividendLabel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!isDividend && (
            <div>
              <Label>{t("unitsLabel")}</Label>
              <Input
                type="number"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="10"
              />
            </div>
          )}
          <div>
            <Label>{isDividend ? t("totalDividendAmount") : t("pricePerUnit")}</Label>
            <Input
              type="number"
              step="any"
              value={pricePerShare}
              onChange={(e) => setPricePerShare(e.target.value)}
              placeholder={isDividend ? "25.50" : "105.30"}
            />
          </div>
          {!isDividend && (
            <div>
              <Label>{t("commissionLabel")}</Label>
              <Input
                type="number"
                step="any"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
          <div>
            <Label>{t("date")}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("notesLabel")}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("optionalPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !positionId || !pricePerShare || (!isDividend && !shares)}
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Update Prices Dialog ─── */

function UpdatePricesDialog({
  open,
  onClose,
  onSaved,
  positions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  positions: Position[];
}) {
  const t = useT();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const promises = Object.entries(prices)
        .filter(([, v]) => v && parseFloat(v) > 0)
        .map(([ticker, price]) =>
          apiFetch("/api/investments/prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker, price: parseFloat(price), date: today }),
          })
        );
      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) { const { toast } = await import("sonner"); toast.error(`${failed} ${t("pricesNotUpdated")}`); }
      setPrices({});
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("updatePrices")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {positions.map((pos) => (
            <div key={pos.ticker} className="flex items-center gap-3">
              <div className="w-24 text-sm font-mono">{pos.ticker}</div>
              <Input
                type="number"
                step="any"
                placeholder={pos.current_price > 0 ? String(pos.current_price) : "0.00"}
                value={prices[pos.ticker] ?? ""}
                onChange={(e) =>
                  setPrices({ ...prices, [pos.ticker]: e.target.value })
                }
                className="flex-1"
              />
            </div>
          ))}
          {positions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noPositionsToUpdate")}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("savePrices")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
