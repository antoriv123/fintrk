"use client";
import { apiFetch } from "@/lib/api";

import Link from "next/link";
import { useState, useCallback, useMemo } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Users, ListOrdered, Wallet, Clock,
  Shield, Trash2, Unlock, ChevronDown, ChevronUp,
  Mail, Activity, Bell, Search, Crown,
  CheckSquare, Square, ArrowUpDown, ArrowDown, ArrowUp,
} from "lucide-react";

interface UserStat {
  id: number;
  email: string;
  name: string;
  role: string;
  subscription_tier: string;
  created_at: string;
  last_login_at: string | null;
  failed_login_attempts: number;
  last_failed_login: string | null;
  transaction_count: number;
  account_count: number;
  total_income: number;
  total_expenses: number;
  last_activity: string | null;
  push_enabled: number;
}

interface AdminStats {
  totals: { users: number; transactions: number; accounts: number; waitlist: number };
  growth: { signupsThisMonth: number; signupsLastMonth: number; txThisMonth: number; txLastMonth: number };
  userStats: UserStat[];
}

interface WaitlistData {
  total: number;
  entries: { email: string; createdAt: string }[];
}

type SortField = "last_login_at" | "created_at" | "transaction_count" | "name" | "total_expenses";
type SortDir = "asc" | "desc";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d: string | null): string {
  if (!d) return "Nunca";
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function activityColor(d: string | null): string {
  if (!d) return "text-red-400";
  const ms = Date.now() - new Date(d).getTime();
  const hours = ms / 3600000;
  if (hours < 24) return "text-green-500";
  if (hours < 72) return "text-amber-400";
  if (hours < 168) return "text-orange-400";
  return "text-red-400";
}

function growthPct(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "0%";
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "last_login_at", label: "Ultima conexion" },
  { field: "created_at", label: "Registro" },
  { field: "transaction_count", label: "Transacciones" },
  { field: "name", label: "Nombre" },
  { field: "total_expenses", label: "Gastos" },
];

export default function AdminPage() {
  const { data: stats, loading, refresh: refreshStats } = useFetch<AdminStats>("/api/admin/stats");
  const { data: waitlist, refresh: refreshWaitlist } = useFetch<WaitlistData>("/api/admin/waitlist");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "waitlist">("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  // Multi-select
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("last_login_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Push dialog (single or bulk)
  const [pushDialog, setPushDialog] = useState<{ userId?: number; name: string; bulk?: boolean } | null>(null);
  const [pushTitle, setPushTitle] = useState("fintrk");
  const [pushBody, setPushBody] = useState("");
  const [pushSending, setPushSending] = useState(false);

  // Delete dialog (single or bulk)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Bulk tier
  const [bulkTierDialog, setBulkTierDialog] = useState(false);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }, [sortField]);

  const toggleSelectUser = useCallback((id: number) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((users: UserStat[]) => {
    setSelectedUsers((prev) => {
      const nonAdminUsers = users.filter((u) => u.role !== "admin");
      if (prev.size === nonAdminUsers.length) return new Set();
      return new Set(nonAdminUsers.map((u) => u.id));
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedUsers(new Set());
  }, []);

  const handleUserAction = useCallback(async (userId: number, action: string, body?: Record<string, unknown>) => {
    setActionLoading(`${userId}-${action}`);
    try {
      if (action === "delete") {
        const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const { toast } = await import("sonner");
          toast.error(data.error || "Error al eliminar");
          return;
        }
        setDeleteConfirmId(null);
      } else {
        const res = await apiFetch(`/api/admin/users/${userId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? { action }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const { toast } = await import("sonner");
          toast.error(data.error || "Error");
          return;
        }
      }
      const { toast } = await import("sonner");
      toast.success("Hecho");
      await refreshStats();
    } finally { setActionLoading(null); }
  }, [refreshStats]);

  async function handleRemoveWaitlist(email: string) {
    setActionLoading(`wl-${email}`);
    try {
      await apiFetch(`/api/admin/waitlist?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      refreshWaitlist();
    } finally { setActionLoading(null); }
  }

  async function sendPush() {
    if (!pushDialog || !pushBody) return;
    setPushSending(true);
    try {
      let res: Response;
      if (pushDialog.bulk) {
        res = await apiFetch("/api/admin/bulk", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "push",
            userIds: Array.from(selectedUsers),
            title: pushTitle,
            message: pushBody,
          }),
        });
      } else {
        res = await apiFetch("/api/push/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: pushDialog.userId, title: pushTitle, body: pushBody }),
        });
      }
      const data = await res.json().catch(() => ({}));
      const { toast } = await import("sonner");
      if (res.ok && (data.sent ?? 0) > 0) {
        toast.success(`Push enviada (${data.sent} de ${data.total})`);
        setPushDialog(null); setPushBody(""); setPushTitle("fintrk");
        if (pushDialog.bulk) exitSelectionMode();
      } else if (res.ok) {
        toast.error(`Fallida: ${data.errors?.join(", ") || data.error || "No se pudo enviar"}`);
      } else {
        toast.error(data.error || `Error ${res.status}`);
      }
    } catch {
      const { toast } = await import("sonner");
      toast.error("Error de conexion");
    } finally { setPushSending(false); }
  }

  async function handleBulkDelete() {
    setBulkActionLoading(true);
    try {
      const res = await apiFetch("/api/admin/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", userIds: Array.from(selectedUsers) }),
      });
      const data = await res.json().catch(() => ({}));
      const { toast } = await import("sonner");
      if (res.ok) {
        toast.success(`${data.deleted} usuarios eliminados${data.skipped > 0 ? ` (${data.skipped} omitidos)` : ""}`);
        setBulkDeleteConfirm(false);
        exitSelectionMode();
        await refreshStats();
      } else {
        toast.error(data.error || "Error");
      }
    } finally { setBulkActionLoading(false); }
  }

  async function handleBulkTier(tier: string) {
    setBulkActionLoading(true);
    try {
      const res = await apiFetch("/api/admin/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_tier", userIds: Array.from(selectedUsers), tier }),
      });
      const data = await res.json().catch(() => ({}));
      const { toast } = await import("sonner");
      if (res.ok) {
        toast.success(`${data.updated} usuarios actualizados a ${tier}`);
        setBulkTierDialog(false);
        exitSelectionMode();
        await refreshStats();
      } else {
        toast.error(data.error || "Error");
      }
    } finally { setBulkActionLoading(false); }
  }

  // Sorted & filtered users
  const processedUsers = useMemo(() => {
    if (!stats) return [];
    let users = [...stats.userStats];

    // Filter
    if (userSearch) {
      const q = userSearch.toLowerCase();
      users = users.filter((u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.subscription_tier.includes(q)
      );
    }

    // Sort
    users.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "last_login_at": {
          const aTime = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
          const bTime = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "transaction_count":
          cmp = Number(a.transaction_count) - Number(b.transaction_count);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "total_expenses":
          cmp = Number(a.total_expenses) - Number(b.total_expenses);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return users;
  }, [stats, userSearch, sortField, sortDir]);

  if (loading || !stats) {
    return (
      <div className="animate-in space-y-5">
        <Skeleton className="h-8 w-60" />
        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const activeUsers = stats.userStats.filter((u) => {
    if (!u.last_login_at) return false;
    return Date.now() - new Date(u.last_login_at).getTime() < 7 * 24 * 3600000;
  });
  const pushEnabledCount = stats.userStats.filter((u) => Number(u.push_enabled) > 0).length;

  const tabs = [
    { id: "overview" as const, label: "General" },
    { id: "users" as const, label: `Usuarios (${stats.totals.users})` },
    { id: "waitlist" as const, label: `Waitlist (${stats.totals.waitlist})` },
  ];

  return (
    <div className="animate-in space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-[#2D6A4F]" />
          <h1 className="text-xl font-bold">Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/reports"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Reports
          </Link>
          <Link href="/admin/import-stats"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Import stats
          </Link>
          <Link href="/admin/feedback"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Feedback
          </Link>
        </div>
      </div>

      <div className="flex gap-1.5 bg-muted/40 p-1 rounded-xl">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id !== "users") exitSelectionMode(); }}
            className={`flex-1 text-xs font-medium py-2 rounded-lg transition-all ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><Users size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">USUARIOS</span></div>
              <p className="text-2xl font-extrabold text-[#2D6A4F]">{stats.totals.users}</p>
              <p className="text-[11px] text-muted-foreground">{growthPct(stats.growth.signupsThisMonth, stats.growth.signupsLastMonth)} vs mes anterior</p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><Activity size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">ACTIVOS 7D</span></div>
              <p className="text-2xl font-extrabold text-green-500">{activeUsers.length}</p>
              <p className="text-[11px] text-muted-foreground">{stats.totals.users > 0 ? Math.round((activeUsers.length / stats.totals.users) * 100) : 0}% del total</p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><ListOrdered size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">TRANSACCIONES</span></div>
              <p className="text-2xl font-extrabold">{stats.totals.transactions.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">{growthPct(stats.growth.txThisMonth, stats.growth.txLastMonth)} vs mes anterior</p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><Bell size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">PUSH ACTIVO</span></div>
              <p className="text-2xl font-extrabold text-blue-500">{pushEnabledCount}</p>
              <p className="text-[11px] text-muted-foreground">{stats.totals.users > 0 ? Math.round((pushEnabledCount / stats.totals.users) * 100) : 0}% con push</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><Wallet size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">CUENTAS</span></div>
              <p className="text-2xl font-extrabold">{stats.totals.accounts}</p>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2"><Clock size={14} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground tracking-wide">WAITLIST</span></div>
              <p className="text-2xl font-extrabold text-amber-400">{stats.totals.waitlist}</p>
            </div>
          </div>

          {/* Top users by activity */}
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="p-4 pb-2"><p className="text-[10px] text-muted-foreground tracking-wide">TOP USUARIOS POR ACTIVIDAD</p></div>
            {stats.userStats.sort((a, b) => Number(b.transaction_count) - Number(a.transaction_count)).slice(0, 5).map((u, i) => (
              <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}>
                <span className="w-6 h-6 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums">{Number(u.transaction_count)} tx</p>
                  <p className={`text-[10px] ${activityColor(u.last_login_at)}`}>{timeAgo(u.last_login_at)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Recently connected */}
          <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="p-4 pb-2"><p className="text-[10px] text-muted-foreground tracking-wide">ULTIMA CONEXION</p></div>
            {[...stats.userStats]
              .filter((u) => u.last_login_at)
              .sort((a, b) => new Date(b.last_login_at!).getTime() - new Date(a.last_login_at!).getTime())
              .slice(0, 5)
              .map((u, i) => (
                <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    Date.now() - new Date(u.last_login_at!).getTime() < 3600000 ? "bg-green-500" :
                    Date.now() - new Date(u.last_login_at!).getTime() < 86400000 ? "bg-amber-400" : "bg-red-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{formatDateTime(u.last_login_at!)}</p>
                </div>
              ))}
            {stats.userStats.filter((u) => !u.last_login_at).length > 0 && (
              <div className="px-4 py-2 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground">
                  {stats.userStats.filter((u) => !u.last_login_at).length} usuarios nunca conectados
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "users" && (
        <div className="space-y-3">
          {/* Search + Selection toggle */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2 shadow-sm">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <Input type="text" placeholder="Buscar usuario..." value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="border-0 p-0 h-8 shadow-none focus-visible:ring-0 text-sm" />
            </div>
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              className={`h-[44px] px-3 shrink-0 ${selectionMode ? "bg-primary hover:bg-primary/90" : ""}`}
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
            >
              <CheckSquare size={16} />
            </Button>
          </div>

          {/* Sort bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <ArrowUpDown size={12} className="text-muted-foreground shrink-0" />
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.field}
                onClick={() => toggleSort(opt.field)}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  sortField === opt.field
                    ? "bg-[#2D6A4F]/10 text-[#2D6A4F] font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
                {sortField === opt.field && (
                  sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />
                )}
              </button>
            ))}
          </div>

          {/* Bulk action bar */}
          {selectionMode && selectedUsers.size > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 px-4 py-3 shadow-sm">
              <button
                onClick={() => toggleSelectAll(processedUsers)}
                className="text-[11px] text-[#2D6A4F] font-semibold underline underline-offset-2"
              >
                {selectedUsers.size === processedUsers.filter((u) => u.role !== "admin").length ? "Deseleccionar" : "Seleccionar"} todos
              </button>
              <span className="text-[11px] text-muted-foreground flex-1">{selectedUsers.size} seleccionados</span>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => setPushDialog({ name: `${selectedUsers.size} usuarios`, bulk: true })}>
                <Bell size={12} /> Push
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => setBulkTierDialog(true)}>
                <Crown size={12} /> Tier
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 text-red-400"
                onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 size={12} /> Eliminar
              </Button>
            </div>
          )}

          {/* Select all toggle when in selection mode */}
          {selectionMode && selectedUsers.size === 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/30 px-4 py-2">
              <button
                onClick={() => toggleSelectAll(processedUsers)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Seleccionar todos ({processedUsers.filter((u) => u.role !== "admin").length})
              </button>
            </div>
          )}

          {/* User list */}
          {processedUsers.map((u) => {
            const isExpanded = expandedUser === u.id;
            const isLocked = Number(u.failed_login_attempts) >= 5;
            const tier = u.subscription_tier || "free";
            const isSelected = selectedUsers.has(u.id);
            const hasPush = Number(u.push_enabled) > 0;

            return (
              <div key={u.id} className={`rounded-2xl bg-card border shadow-sm overflow-hidden transition-colors ${
                isSelected ? "border-[#2D6A4F] bg-[#2D6A4F]/5" : "border-border"
              }`}>
                <div className="flex items-center gap-2 p-4">
                  {/* Checkbox */}
                  {selectionMode && u.role !== "admin" && (
                    <button
                      onClick={() => toggleSelectUser(u.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isSelected
                        ? <CheckSquare size={18} className="text-[#2D6A4F]" />
                        : <Square size={18} />
                      }
                    </button>
                  )}
                  {selectionMode && u.role === "admin" && (
                    <div className="w-[18px] shrink-0" />
                  )}

                  {/* User info */}
                  <button onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                    className="flex-1 flex items-center gap-3 text-left active:bg-muted/30 transition-colors min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#2D6A4F]/10 flex items-center justify-center shrink-0 relative">
                      <span className="text-sm font-bold text-[#2D6A4F]">{u.name.charAt(0).toUpperCase()}</span>
                      {/* Online indicator */}
                      {u.last_login_at && Date.now() - new Date(u.last_login_at).getTime() < 3600000 && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{u.name}</span>
                        {u.role === "admin" && <span className="text-[8px] bg-[#2D6A4F] text-white px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>}
                        {tier === "beta" && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full font-bold">BETA</span>}
                        {tier === "pro" && <span className="text-[8px] bg-[#2D6A4F]/20 text-[#2D6A4F] px-1.5 py-0.5 rounded-full font-bold">PRO</span>}
                        {isLocked && <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">LOCK</span>}
                        {hasPush && <Bell size={10} className="text-blue-400" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold tabular-nums">{Number(u.transaction_count)} tx</p>
                      <p className={`text-[10px] ${activityColor(u.last_login_at)}`}>
                        {u.last_login_at ? timeAgo(u.last_login_at) : "Nunca"}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center"><p className="text-lg font-bold tabular-nums">{Number(u.transaction_count)}</p><p className="text-[9px] text-muted-foreground">TX</p></div>
                      <div className="text-center"><p className="text-lg font-bold tabular-nums">{Number(u.account_count)}</p><p className="text-[9px] text-muted-foreground">Cuentas</p></div>
                      <div className="text-center"><p className="text-lg font-bold tabular-nums text-[#2D6A4F]">{"\u20AC"}{Math.round(Number(u.total_income))}</p><p className="text-[9px] text-muted-foreground">Ingresos</p></div>
                      <div className="text-center"><p className="text-lg font-bold tabular-nums text-red-400">{"\u20AC"}{Math.round(Number(u.total_expenses))}</p><p className="text-[9px] text-muted-foreground">Gastos</p></div>
                    </div>

                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <p>Registro: {formatDate(u.created_at)} · Tier: {tier} · Fallos login: {Number(u.failed_login_attempts)}</p>
                      <p>
                        Ultima conexion: {u.last_login_at ? formatDateTime(u.last_login_at) : "Nunca"}
                        {u.last_login_at && <span className={`ml-1 ${activityColor(u.last_login_at)}`}>({timeAgo(u.last_login_at)})</span>}
                      </p>
                      <p>Ultima actividad: {u.last_activity ? formatDateTime(u.last_activity) : "Sin transacciones"}</p>
                      <p>Push: {hasPush ? "Activado" : "No activado"}</p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" className="text-xs h-8"
                        disabled={actionLoading === `${u.id}-set_tier`}
                        onClick={() => handleUserAction(u.id, "set_tier", { action: "set_tier", tier: tier === "beta" ? "free" : "beta" })}>
                        <Crown size={12} className="mr-1" /> {tier === "beta" ? "Quitar beta" : "Hacer beta"}
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8"
                        onClick={() => setPushDialog({ userId: u.id, name: u.name })}
                        disabled={!hasPush}>
                        <Bell size={12} className="mr-1" /> Push
                      </Button>
                      {isLocked && (
                        <Button variant="outline" size="sm" className="text-xs h-8"
                          disabled={actionLoading === `${u.id}-unlock`}
                          onClick={() => handleUserAction(u.id, "unlock")}>
                          <Unlock size={12} className="mr-1" /> Desbloquear
                        </Button>
                      )}
                      {u.role !== "admin" && (
                        <Button variant="outline" size="sm" className="text-xs h-8 text-red-400"
                          disabled={actionLoading === `${u.id}-delete`}
                          onClick={() => setDeleteConfirmId(u.id)}>
                          <Trash2 size={12} className="mr-1" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {processedUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No se encontraron usuarios
            </div>
          )}
        </div>
      )}

      {activeTab === "waitlist" && (
        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="p-4 pb-2"><p className="text-[10px] text-muted-foreground tracking-wide">WAITLIST ({waitlist?.total ?? 0})</p></div>
          {!waitlist || waitlist.entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Sin entradas</div>
          ) : (
            waitlist.entries.map((entry, i) => (
              <div key={entry.email} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}>
                <Mail size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.email}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(entry.createdAt)}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 text-red-400"
                  disabled={actionLoading === `wl-${entry.email}`}
                  onClick={() => handleRemoveWaitlist(entry.email)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete single user dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar usuario</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminaran TODOS los datos de este usuario (transacciones, cuentas, configuracion). Esta accion no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive"
              disabled={actionLoading === `${deleteConfirmId}-delete`}
              onClick={() => { if (deleteConfirmId) handleUserAction(deleteConfirmId, "delete"); }}>
              {actionLoading === `${deleteConfirmId}-delete` ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => { if (!open) setBulkDeleteConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar {selectedUsers.size} usuarios</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminaran TODOS los datos de {selectedUsers.size} usuarios seleccionados. Admins seran omitidos. Esta accion no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={bulkActionLoading} onClick={handleBulkDelete}>
              {bulkActionLoading ? "Eliminando..." : `Eliminar ${selectedUsers.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk tier dialog */}
      <Dialog open={bulkTierDialog} onOpenChange={(open) => { if (!open) setBulkTierDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar tier ({selectedUsers.size} usuarios)</DialogTitle></DialogHeader>
          <div className="flex gap-2 py-4">
            {["free", "beta", "pro"].map((tier) => (
              <Button key={tier} variant="outline" className="flex-1"
                disabled={bulkActionLoading}
                onClick={() => handleBulkTier(tier)}>
                {tier === "free" && "Free"}
                {tier === "beta" && "Beta"}
                {tier === "pro" && "Pro"}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTierDialog(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push dialog (single or bulk) */}
      <Dialog open={!!pushDialog} onOpenChange={(open) => { if (!open) setPushDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Push a {pushDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Titulo</label>
              <Input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Mensaje</label>
              <Input value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="Escribe el mensaje..." autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialog(null)}>Cancelar</Button>
            <Button onClick={sendPush} disabled={pushSending || !pushBody} className="bg-primary hover:bg-primary/90">
              {pushSending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
