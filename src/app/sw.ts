import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Flags live under /public/flags/*.png. We precache them explicitly so the
// language + country pickers always render, even in installed PWA / offline.
const FLAG_ASSETS: string[] = [
  "ar", "at", "be", "cl", "co", "de", "ec", "es", "fr",
  "gb", "ie", "it", "mx", "nl", "pe", "pt", "us", "uy",
].map((c) => `/flags/${c}.png`);

const precacheEntries = [
  ...(self.__SW_MANIFEST ?? []),
  ...FLAG_ASSETS.map((url) => ({ url, revision: "v1" } as PrecacheEntry)),
];

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Admin panel bypass — must register BEFORE serwist so our listener wins the
// respondWith race. Without this, the SW can serve a stale shell for
// /admin/* (or /offline fallback) when a new admin route appears after
// the user's SW was installed. Admin paths change often and are never worth
// caching, so we always go to the network.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api/admin")
  ) {
    event.respondWith(fetch(event.request));
  }
});

serwist.addEventListeners();

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, url, icon, badge } = data;

    const options: NotificationOptions & { data?: Record<string, string> } = {
      body: body ?? "",
      icon: icon ?? "/icon-192.png",
      badge: badge ?? "/icon-192.png",
      data: { url: url ?? "/dashboard" },
      tag: "fintrk-notification",
    };
    event.waitUntil(self.registration.showNotification(title ?? "fintrk", options));
  } catch {
    // Ignore malformed push data
  }
});

// Notification click handler — open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes("fintrk.app") && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
