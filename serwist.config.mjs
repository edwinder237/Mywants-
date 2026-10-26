// Serwist (the maintained successor to next-pwa) in configurator mode, which
// works with Turbopack: `next build` runs first, then `serwist build` bundles
// src/worker/sw.ts with a precache manifest of the build output.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { serwist } from "@serwist/next/config";

// The web manifest is a generated route, so it isn't in Serwist's globs. Give
// it a content revision so installed apps pick up name/icon changes.
const manifestRevision = createHash("sha256").update(readFileSync("out/manifest.webmanifest")).digest("hex").slice(0, 16);

export default serwist({
  swSrc: "src/worker/sw.ts",
  // Static export: the worker must sit next to index.html in out/.
  swDest: "out/sw.js",
  additionalPrecacheEntries: [{ url: "/manifest.webmanifest", revision: manifestRevision }],
});
