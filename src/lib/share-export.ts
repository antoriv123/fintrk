"use client";

import { apiFetch } from "./api";

/**
 * Descarga un archivo desde un endpoint del API y lo entrega al usuario.
 * Web/PWA only (OSS edition — Capacitor removed): blob download compatible
 * con Safari iOS standalone PWA.
 */
export async function downloadOrShare(
  endpoint: string,
  filename: string,
  _dialogTitle?: string,
): Promise<void> {
  const res = await apiFetch(endpoint);
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  const text = await res.text();

  // Web / PWA — blob download
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
