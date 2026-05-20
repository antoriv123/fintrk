"use client";

/**
 * Offline queue for POST requests while the device has no network.
 *
 * When a user registers a transaction from the wizard, /api/transactions or
 * the QuickAdd and we're offline, we persist the request in localStorage.
 * When the browser fires the `online` event, we replay them in order and
 * surface a toast so the user knows they synced.
 *
 * Limited to JSON-body POSTs (transactions / streak check-ins). Imports,
 * scans, etc. still require network because they need AI.
 */

const STORAGE_KEY = "fintrk-offline-queue";
const MAX_QUEUE = 200;

export interface QueuedRequest {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body: string;
  headers?: Record<string, string>;
  createdAt: number;
  tries: number;
}

function readQueue(): QueuedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequest[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Storage full — drop the oldest half.
    const half = queue.slice(-Math.floor(MAX_QUEUE / 2));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(half)); } catch { /* give up */ }
  }
}

export function isOnline(): boolean {
  if (typeof window === "undefined") return true;
  return navigator.onLine !== false;
}

export function queueSize(): number {
  return readQueue().length;
}

/**
 * Append a request to the offline queue. Returns a synthetic id so the caller
 * can show an "unsynced" badge if needed.
 */
export function enqueue(req: Omit<QueuedRequest, "id" | "createdAt" | "tries">): string {
  const id = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueuedRequest = { ...req, id, createdAt: Date.now(), tries: 0 };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  try { window.dispatchEvent(new CustomEvent("fintrk-offline-enqueued")); } catch { /* ignore */ }
  return id;
}

/**
 * Try to flush the queue. Returns the number of successfully sent requests.
 * Individual failures leave the entry in the queue (tries++). 4xx responses
 * are treated as permanent failures and the entry is dropped.
 */
export async function flushQueue(): Promise<{ sent: number; failed: number; remaining: number }> {
  if (!isOnline()) return { sent: 0, failed: 0, remaining: readQueue().length };

  const queue = readQueue();
  const kept: QueuedRequest[] = [];
  let sent = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers ?? { "Content-Type": "application/json" },
        body: entry.body,
        credentials: "include",
      });
      if (res.ok) {
        sent++;
        continue;
      }
      // 4xx — permanent client error, drop it.
      if (res.status >= 400 && res.status < 500) {
        failed++;
        continue;
      }
      // 5xx or unknown — keep for retry.
      kept.push({ ...entry, tries: entry.tries + 1 });
    } catch {
      // Network failed mid-flush — put it back.
      kept.push({ ...entry, tries: entry.tries + 1 });
    }
  }

  writeQueue(kept);
  if (sent > 0 || failed > 0) {
    try { window.dispatchEvent(new CustomEvent("fintrk-offline-flushed", { detail: { sent, failed } })); } catch { /* ignore */ }
  }
  return { sent, failed, remaining: kept.length };
}

/**
 * Register automatic sync when the browser regains network.
 * Call this once from a top-level client component.
 */
export function startAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => { void flushQueue(); };
  window.addEventListener("online", onOnline);
  // Also try right now in case the app just mounted online with pending items.
  if (isOnline() && readQueue().length > 0) void flushQueue();
  return () => window.removeEventListener("online", onOnline);
}
