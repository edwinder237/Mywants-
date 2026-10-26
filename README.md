# my wants.

**Want it. Earn it. Enjoy it.**

A mobile-first, private wishlist that turns discretionary purchases into earned
rewards. Each want has exactly **three dependencies**, things you choose to
finish first. When all three are done the want **unlocks**, and you decide:
do you still want it, and can you comfortably afford it without adding
unwanted debt? You can buy it (and mark it purchased), wait, or archive it.

Unlocking is permission to reconsider buying. It is not a sign that the
purchase is affordable.

- No account, backend, API keys, analytics, or paid services. Data stays in
  your browser's IndexedDB on your device.
- Installable PWA that works offline after the first load.
- JSON export and import (merge or replace) for backups and moving devices.

The product spec is [`PROJECT.md`](./PROJECT.md). Decisions made where it was
open are listed under [Implementation notes](#implementation-notes).

## Setup

Needs Node.js 22.13+ (or 24+) and npm.

```bash
npm install
npm run dev            # http://localhost:3000 (service worker off in dev)
```

Production build and local preview:

```bash
npm run build          # next build (static export to ./out) + serwist build (out/sw.js)
npm start              # serves ./out on http://localhost:3000
```

### Try it on your iPhone

Service workers and "Add to Home Screen" offline support need HTTPS. Two
zero-cost options:

1. **Deploy `out/` to a free static host** (see [Hosting](#hosting-optional)),
   open the URL in Safari, then Share → **Add to Home Screen**.
2. **Same Wi-Fi, no deploy:** `npm run build && npx serve out -l 3000`, then
   open `http://<your-mac's-LAN-IP>:3000` on the iPhone. The app works, but
   over plain HTTP the service worker is disabled, so offline mode and
   installation can't be tested this way.

## Checks

```bash
npm run lint           # ESLint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest + React Testing Library (jsdom, fake-indexeddb)
npm run build
npm run test:e2e       # Playwright smoke tests against ./out (run a build first)
npm run check          # everything above, in order
```

On a new machine, install the Playwright browser once:
`npx playwright install chromium`.

## Your data: limits and backups

- **Local only.** Wants live in this browser's IndexedDB on this device.
  Nothing syncs between devices, for example between your iPhone and your
  MacBook. On iOS, Safari and the Home Screen app keep separate data.
- **It can disappear.** Clearing site data, removing the Home Screen app,
  private browsing, or switching devices loses data you haven't exported.
  iOS can evict website storage: Safari tabs after about a week without use,
  and even Home Screen apps under storage pressure. After your first save the
  app asks the browser for persistent storage, but the browser can refuse.
  Treat storage as convenient, not permanent.
- **Back up with export.** Menu → *Export backup (JSON)* saves every want
  in every state, with purchase details and photos, so files with photos can
  be several MB. They're named `my-wants-YYYY-MM-DD.json`. On iPhone the share
  sheet opens; choose *Save to Files*. On desktop the file downloads. Export
  after changes you'd hate to lose, and before clearing your browser or
  switching devices.
- **Restore with import.** Menu → *Import backup…* checks the file first.
  Invalid or unrelated files are rejected and nothing changes. Then choose:
  - **Merge** adds wants that aren't here yet and updates ones whose copy in
    the file is newer. Nothing is deleted.
  - **Replace** deletes the wants on this device and loads the file instead.
- **Photos** are resized (longest edge 1024 px) and re-encoded as JPEG,
  usually under 300 KB each. If the device runs out of storage, the app
  says so and keeps your existing data.
- **Moving devices:** export on the old device, open the app on the new one,
  then *Import backup… → Replace* (or *Merge* to combine).
- **Not a secure vault.** Data isn't encrypted, and anyone using this browser
  profile can read it. Don't store account numbers, card numbers, passwords,
  or other sensitive financial details.
- **Privacy:** the app makes no network requests beyond loading itself: no
  analytics, fonts, or third-party scripts.

## Hosting (optional)

`out/` is plain static files, and the app only needs static file hosting.
Build command `npm run build`, output directory `out`. Plans and terms
change, so check the current free-tier limits before publishing:

- **Cloudflare Pages** or **Netlify** (free tiers) deploy from private
  GitHub repos. These are the simplest fit.
- **GitHub Pages** needs a public repo, or a paid GitHub plan for a private
  one.
- **Vercel Hobby** is limited to non-commercial use.

Serve `/sw.js` with `Cache-Control: no-cache` (e.g. a Cloudflare/Netlify
`_headers` file) so updates are picked up promptly.

The app assumes it is served from the domain root (`/`). For a sub-path
(e.g. GitHub Pages project sites), set `basePath` in `next.config.ts`, then
update every root-relative path:

- `src/app/manifest.ts`: `id`, `start_url`, `scope`, and the icon `src`s
- `src/app/layout.tsx`: the `metadata.icons` URLs
- `src/components/sw-register.tsx`: the `/sw.js` URL and `scope`
- `src/worker/sw.ts`: the offline fallback URL `/`
- `serwist.config.mjs`: the `/manifest.webmanifest` precache entry

## How it's built

| Piece | Where |
| --- | --- |
| Data model and rules (pure functions) | `src/lib/wants.ts` |
| Storage interface (swap for sync later) | `src/lib/repository.ts` |
| IndexedDB implementation (`idb`) | `src/lib/db.ts` |
| Export/import schema (zod), merge planning | `src/lib/backup.ts` |
| Photo resize/compression | `src/lib/image.ts` |
| CAD money parsing/formatting (integer cents) | `src/lib/money.ts` |
| App state hook (optimistic writes) | `src/lib/use-wants.ts` |
| UI | `src/components/*`, shadcn/ui primitives in `src/components/ui/*` |
| Service worker (Serwist) | `src/worker/sw.ts`, `serwist.config.mjs` |

- **Status is derived, never stored.** Precedence: Purchased > Archived >
  Unlocked (3/3) > Locked. There is no stored `unlocked` flag, and imports
  that contain one are rejected.
- **Offline:** [Serwist](https://serwist.pages.dev), the maintained
  successor to next-pwa, runs in its Turbopack-compatible configurator
  mode. `serwist build` runs after `next build` and precaches the app shell.
- **shadcn/ui:** components follow the standard shadcn source (Radix UI +
  CVA + Tailwind). They were added by hand because the build environment
  couldn't reach the shadcn registry. `components.json` is included, so
  `npx shadcn add <component>` works normally.

## Implementation notes

Decisions where PROJECT.md left room:

- **Currency** is CAD only in v1 (`currency: "CAD"`), stored as integer cents.
- **Example want** (Lagavulin 16, CAD 143.84) is opt-in from the empty state
  or the menu. It uses a fixed id (`demo-lagavulin-16`) so it's always
  labelled *Example*, without adding a field to the data model.
- **Unlock decision:** completing the third dependency plays a short unlock
  animation in the sheet and asks the two questions. These are prompts, not
  gates. *Mark purchased*, *Not now*, and *Archive instead* get equal visual
  weight, so unlocking doesn't nudge you to buy. *Mark purchased* asks for
  confirmation with a purchase date (defaults to today, editable, no future
  dates) and an optional final price. *Not now* leaves the want unlocked.
- **Archive** applies to locked or unlocked wants. **Restore** returns the
  want to locked or unlocked based on its dependencies. Purchased wants
  can't be archived.
- **Dependencies stay editable in every state.** Unchecking relocks an
  active want. Purchased and archived wants keep their status, per the
  precedence rule.
- **Edits keep progress:** changing a dependency's wording keeps its
  completion state.
- **Merge** matches wants by id. The most recently updated copy wins, and
  merge never deletes.
- **Unreadable records** in local storage (e.g. from an older build) are
  skipped and reported, never deleted, even by *Replace*.
- **The list follows the want:** when an action changes a want's status
  (unlocked, purchased, archived, restored), the filter switches to it.
  On launch the app opens the first non-empty filter.
- **Several tabs:** open tabs reload from storage when another tab saves, so
  a stale tab can't overwrite newer changes.
- **Theme** follows the system by default. Menu → Theme picks Light or
  Dark on this device.
- **No telemetry** is added by the app. The Next.js CLI collects anonymous
  build telemetry on developer machines; turn it off with
  `npx next telemetry disable` or `NEXT_TELEMETRY_DISABLED=1`.
- **Updates:** the service worker activates new versions immediately, and
  they show on the next launch. There is no in-app update prompt.

## Manual QA on a real iPhone

Automated tests can't cover iOS installation or storage. Before relying on a
deploy, check on a device:

1. Open the HTTPS URL in Safari, then Share → **Add to Home Screen**. Launch it
   from the icon (standalone, no Safari toolbar).
2. Add a want with a photo from the camera and one from the library. Tick
   dependencies to 3/3 and see the unlock moment. Decide → mark purchased with
   a past date and final price.
3. Archive a want, find it under *Archived*, and restore it.
4. Turn on Airplane Mode, force-quit the app, and relaunch: it opens and your
   wants are there.
5. Reboot the phone: data is still there.
6. Export (share sheet → Save to Files), delete a want, import the file with
   **Merge** and then with **Replace**; check the counts and results.
7. Switch the system to Dark Mode, and try Menu → Theme.
8. Remember that Safari tab data and Home Screen app data are separate.

## Known limitations

- The iPhone experience (installation, offline launch, storage eviction,
  share sheet) must be checked on a real device. Automated tests run in
  Chromium at iPhone sizes, not in WebKit. Behaviour varies across browsers.
- A new version takes effect the next time the app opens after a deploy.
- No undo for purchases. Edit the purchase date or final price, or delete
  the want.

## Later: cloud sync (Firestore), safely

v1 has no backend on purpose. If sync becomes worth its cost, here's the
lowest-risk path:

1. **Keep IndexedDB as the source of truth.** Implement a second
   `WantRepository` (`src/lib/repository.ts`), or a sync module behind it,
   that writes locally first and pushes and pulls in the background. The UI
   keeps working offline.
2. **The data is ready.** Every want has a stable unique string id (a UUID,
   or the fixed `demo-lagavulin-16` for the example) and `updatedAt`.
   Store one document per want at `users/{uid}/wants/{wantId}` in the export
   shape. Resolve conflicts per document by latest `updatedAt`, the same rule
   `planMerge` uses. Add a `deletedAt` tombstone so deletes sync.
3. **Keep rules in one place.** Status stays derived. Mirror the invariants
   in Firestore Security Rules: owner-only access, exactly three
   dependencies, integer cents, `currency == "CAD"`.
4. **Validate everything pulled** with the same zod `wantSchema` before
   writing it locally.
5. **Photos:** compressed `imageData` (≤ ~300 KB) fits within Firestore's
   1 MiB document limit, so it can stay inline. Cloud Storage for Firebase
   needs the paid Blaze plan for new buckets, so avoid it unless necessary.
6. **Opt in per device** with Firebase Auth (Spark free tier). Keep
   export/import as the escape hatch, and set a billing budget alert before
   enabling any paid plan.
