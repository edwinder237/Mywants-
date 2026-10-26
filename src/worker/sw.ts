/// <reference lib="webworker" />
// Service worker source. `serwist build` bundles it into out/sw.js after
// `next build`, injecting the precache manifest for the static export.
import { defaultCache } from "@serwist/next/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
  // Single-page app: any navigation can be served by the cached shell offline.
  fallbacks: {
    entries: [{ url: "/", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
