# My Wants

A mobile-first, local-first PWA for tracking things you'd like to buy. Each
want has **exactly three dependencies**, things you commit to finishing first.
A want **unlocks** only when all three are done, and only an unlocked want can
be marked **purchased**.

An unlock means you kept your commitments. It does **not** mean the purchase
is affordable, and the app says so wherever it matters.

- No backend, accounts, API keys, or paid services. Data lives in IndexedDB on
  your device.
- JSON export and import for backups and moving between devices.
- Installable on iPhone ("Add to Home Screen"). Works offline after the first
  load.

See [`PROJECT.md`](./PROJECT.md) for scope, acceptance criteria, and the
assumptions made where the brief was open.

## Setup

Requires Node.js 22.13+ (or 24+) and npm. The test tooling needs it; the app alone builds on Node 20.9+.

```bash
npm install
npm run dev            # http://localhost:3000 (service worker disabled in dev)
```

Production build and local preview:

```bash
npm run build          # static export to ./out, then writes out/sw.js
npm start              # serves ./out on http://localhost:3000
```

To try it on an iPhone, deploy `out/` to any static host (see below), open it
in Safari, then use Share → Add to Home Screen. Service workers need HTTPS
(or `localhost`).

## Checks

```bash
npm run lint           # ESLint (next/core-web-vitals + TypeScript)
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest unit + component tests (jsdom, fake-indexeddb)
npm run build
npm run test:e2e       # Playwright against ./out (build first)
npm run check          # all of the above, in order
```

The first time you run e2e tests on a new machine, install the browser once
with `npx playwright install chromium`.

E2E runs at iPhone SE (375 px), iPhone 15 Pro Max (430 px), and desktop sizes.
It covers the full unlock → purchase flow, reload persistence, no horizontal
scroll, 44 px touch targets, export → import round trip, rejection of bad
import files, and an offline reload through the service worker.

## Deploying (free)

`out/` is plain static files. Any free static host works: Cloudflare Pages,
GitHub Pages, Netlify, or Vercel. Build command `npm run build`, output
directory `out`. The app assumes it's served from the domain root (`/`). To
use a sub-path such as GitHub Pages project sites, set `basePath` in
`next.config.ts` and update the paths in `src/app/manifest.ts`,
`src/components/sw-register.tsx`, and `scripts/build-sw.mjs`.

## How it's built

| Piece | Where |
| --- | --- |
| Domain rules (pure functions: create, toggle, purchase, derived unlock) | `src/lib/wants.ts` |
| Money parsing/formatting (integer cents) | `src/lib/money.ts` |
| Export format + strict import validation (zod) | `src/lib/backup.ts` |
| IndexedDB storage (`idb`) | `src/lib/db.ts` |
| React state that writes every change through to IndexedDB | `src/lib/use-wants.ts` |
| UI | `src/components/*`, shadcn/ui primitives in `src/components/ui/*` |
| Offline service worker (generated at build) | `scripts/build-sw.mjs` |
| App icons (rendered from `public/icon.svg`) | `scripts/generate-icons.mjs` |

Unlock state is never stored. It is always computed from the three
dependencies' `completedAt` fields. The import schema rejects any extra
fields, including a stored `unlocked` flag.

The shadcn/ui components were written by hand in the standard shadcn style
(Radix UI + CVA + Tailwind), because the build environment couldn't reach
the shadcn registry. `components.json` is included, so
`npx shadcn add <component>` works as usual.

## Known limitations

- **Data is per browser, per device.** Nothing syncs. Clearing Safari website
  data, or deleting the home-screen app, deletes your wants. Export
  regularly.
- **iOS storage eviction.** Safari may clear script-written storage for sites
  you haven't opened in about seven days. Apps added to the Home Screen are
  exempt. The app also asks for persistent storage
  (`navigator.storage.persist()`), but browsers can refuse. Install the app
  and keep an export as a backup.
- **Safari tab and Home Screen app keep separate data on iOS.** Use export and
  import to move data between them.
- **Import replaces everything.** There is no merging. You confirm first, and
  invalid files never change existing data.
- **Purchases can't be undone.** Delete the want instead. Dependencies freeze
  once a want is purchased.
- **Two-decimal currencies only** (CAD, USD, EUR, GBP, AUD, CHF, MXN). There
  is no currency conversion.
- **Service worker updates** take effect on the next launch after a new
  deploy, not mid-session.
- On iPhone, export opens the share sheet (choose **Save to Files**). On
  desktop it downloads the file.
- E2E tests run in Chromium with iPhone viewports and touch emulation, not in
  real WebKit. Check on a real iPhone before relying on it.

## Later: Firestore sync (safest route)

v1 needs no backend. If sync becomes worth its cost, here's the lowest-risk
path:

1. **Keep IndexedDB as the source of truth.** Don't rewrite the app around
   Firestore. Add a sync module beside `src/lib/db.ts` that pushes local
   changes and pulls remote ones. The UI keeps reading local data, so it
   stays fast and works offline.
2. **The data is already sync-ready.** Every want has a stable UUID and an
   `updatedAt` timestamp. Store each want as one document at
   `users/{uid}/wants/{wantId}` with the same shape as the export format.
   Resolve conflicts per document by last write wins on `updatedAt`. Add a
   `deletedAt` tombstone instead of hard deletes so deletions sync.
3. **Keep the rules where they are.** Sync only moves documents. Unlock
   stays derived. Mirror the invariants in Firestore Security Rules:
   exactly three dependencies, `purchasedAt` only when all three have
   `completedAt`, and only the owner `uid` can read or write.
4. **Make sync opt-in.** Use Firebase Auth (free Spark tier) and turn sync
   on per device. The first sync uploads local data. Keep export/import as
   the escape hatch.
5. **Reuse the import validator.** Run `parseBackup`'s schema on every pulled
   document before writing it locally, so bad remote data can't break the
   app.
6. **Watch costs.** One user's wants fit comfortably in the Spark free tier.
   Set a budget alert before enabling billing.
