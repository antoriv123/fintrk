"use client";

/**
 * API helper for fetch calls.
 * Adds Bearer token from localStorage when available.
 *
 * NEXT_PUBLIC_API_URL is prepended to absolute paths starting with `/api/`
 * when the bundle runs inside the Capacitor WebView (or any deployment that
 * sets the env var). On the marketing web (NEXT_PUBLIC_API_URL empty) the
 * fetch stays relative and hits the same Next.js server. credentials default
 * to "include" so the existing httpOnly session cookie keeps working on web
 * while the Bearer header authenticates the native bundle.
 */

// Re-export from platform.ts for backwards compatibility
export { isNative as isNativePlatform } from "./platform";
import { enqueue, isOnline } from "./offline-queue";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Resolve an input to an absolute URL when NEXT_PUBLIC_API_URL is set and
 * the input is a `/api/...` path. Anything else is returned unchanged so
 * cross-origin fetches and full URLs keep their original target.
 */
export function resolveApiUrl(input: string): string {
  if (!API_BASE_URL) return input;
  if (input.startsWith("/api/") || input === "/api") {
    return `${API_BASE_URL}${input}`;
  }
  return input;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ft_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("ft_token", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("ft_token");
}

/**
 * Drop-in replacement for fetch(). Adds auth token if available.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const url = resolveApiUrl(input);
  const isCrossOrigin = url !== input;
  const credentials: RequestCredentials = init?.credentials ?? (isCrossOrigin ? "omit" : "include");
  const token = getAuthToken();

  if (!token) return fetch(url, { ...init, credentials });

  // Merge Authorization header without touching anything else
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) { headers[k] = v; }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  headers["Authorization"] = `Bearer ${token}`;

  return fetch(url, { ...init, headers, credentials });
}

/**
 * Like apiFetch but queues the request locally when offline (for safe idempotent
 * POSTs like creating a transaction). Returns a synthetic 202 response so the
 * caller can continue the happy path. When the device regains network,
 * offline-queue flushes the queue automatically.
 *
 * ONLY use this for POSTs you're willing to replay. Imports and AI scans
 * should still use `apiFetch` and fail loud when offline.
 */
export async function apiFetchOrQueue(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const online = isOnline();
  const method = (init.method ?? "GET").toUpperCase();
  const bodyIsString = typeof init.body === "string";

  if (online || !bodyIsString || method === "GET") {
    return apiFetch(input, init);
  }

  // Convert headers to a plain object for queue persistence.
  const headers: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) { headers[k] = v; }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  enqueue({
    url: resolveApiUrl(input),
    method: method as "POST" | "PUT" | "PATCH" | "DELETE",
    body: init.body as string,
    headers,
  });

  // Fake a success response so UIs can continue.
  return new Response(
    JSON.stringify({ ok: true, queued: true, offline: true }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
}
