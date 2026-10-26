# My Wants — Project Specification

Version: 0.1 (MVP) | Owner: Lumeve Technologies | Status: Proposed

## 1. Product vision

My Wants is a mobile-first, private wishlist that turns discretionary purchases into earned rewards.
Tagline: Want it. Earn it. Enjoy it.

The product is intentionally not a budget tracker, debt management service, or shopping marketplace.
A user creates a want and must complete exactly three user-defined dependencies before the want is unlocked. Unlocking is permission to reconsider buying, not an instruction or guarantee that the purchase is affordable.

## 2. MVP constraints

- Zero additional monthly infrastructure costs for local development and initial testing.
- No Firebase, paid APIs, external database, AI integration, analytics SDK, or account system in v1.
- Mobile-first responsive PWA, installable on iPhone where supported.
- Works offline after initial load.
- Store data locally in browser IndexedDB (use a small, maintained wrapper such as idb); no server-side persistence.
- Private GitHub repository; never commit credentials or personal financial details.
- Clean, calm, polished interface; avoid shaming, guilt, excessive gamification, or dark patterns.
- Do not overengineer: single Next.js app, no microservices, Docker, Redis, or background jobs.

## 3. Core user journey

1. Open dashboard and see active, unlocked, and purchased wants.
2. Add a want: name, price, currency (CAD default), optional image, notes/reason, and category.
3. Set exactly three meaningful dependencies; each has a title, optional description, and completion checkbox.
4. Track progress (0/3, 1/3, 2/3, 3/3).
5. Automatically unlock only when all three are complete.
6. At unlock, ask: Do you still want it? and Can you comfortably afford it without adding unwanted debt? The user can defer, archive, or mark purchased.
7. View completed purchases and archived wants.

## 4. MVP features

### Required

- Dashboard with filters: Locked, Unlocked, Purchased, Archived.
- Add, view, edit, archive, and delete a want (delete with confirmation).
- Exactly three editable dependencies per want; check/uncheck each.
- Derived unlock status: all three complete; unchecking relocks unless already purchased.
- Manual ‘Mark purchased’ action only for unlocked wants; optional purchase date and final price.
- Purchase decision confirmation (no payment processing).
- Local persistence, offline support, empty states, loading states, basic accessibility.
- Export/import all data as JSON with schema validation and clear merge/replace options.
- Optional image stored locally, resized/compressed to avoid storage bloat; graceful handling of storage quota.
- Currency display in CAD by default; store monetary values in integer cents.
- Light/dark theme and responsive design.

### Later, not MVP

- Cloud sync and authentication (potentially Firebase Firestore/Auth).
- AI-suggested dependencies.
- Price monitoring, shopping links, notifications, social sharing, bank connections.
- Integration with Marc OS or other Lumeve services.

## 5. Design direction

- Brand: my wants. — elegant and friendly, minimalist, premium but playful.
- Main screen: compact summary and visually appealing want cards.
- Each card: image/placeholder, item name, price, 3-step progress, lock state, one primary action.
- Clear accessibility labels, keyboard navigation, touch targets >=44px, WCAG AA contrast where practical.
- Delightful but restrained unlock animation; respect reduced-motion preference.
- Avoid presenting fictional sample data as real user data. Include an optional demo item:
  Lagavulin 16, CAD 143.84 (example only; user can delete).
  Example dependencies: pay off one credit card, save CAD 145, stay within spending plan 30 days.

## 6. Data model (TypeScript)

```ts
type Dependency = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
};

type Want = {
  id: string;
  name: string;
  priceCents: number;
  currency: "CAD"; // v1
  category?: string;
  reason?: string;
  imageData?: string; // local compressed image, or store Blob separately
  dependencies: [Dependency, Dependency, Dependency];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  purchasedAt?: string;
  finalPriceCents?: number;
};
```

Derived state precedence: Purchased > Archived > Unlocked (3/3) > Locked. Do not persist a second independent unlocked flag.

## 7. Technical stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui components
- IndexedDB via idb or Dexie, with a small repository interface for future storage migration
- PWA manifest and offline caching using a maintained Next.js-compatible approach
- Vitest + React Testing Library for unit/component tests; Playwright smoke tests if lightweight
- npm or pnpm, whichever is already available in the environment
- Static-first architecture; no paid server services
- Hosting is optional for MVP. If published, choose a free-tier static hosting option compatible with the built output and check current plan limits.

## 8. Acceptance criteria

- Can create a want with exactly three dependencies; cannot save with fewer/more.
- Data persists after refresh and browser restart on the same device.
- Checking 3/3 unlocks; unchecking relocks an unpurchased want.
- Cannot mark a locked want purchased.
- User can edit price/dependencies, archive, restore, delete.
- Import rejects malformed JSON without destroying existing data.
- Export/import round-trip preserves valid wants.
- Offline reopening works after successful installation/initial caching.
- Mobile layout usable at 375px width; desktop also works.
- No cloud services, API keys, telemetry, or monthly infrastructure charges required.
- README documents setup, local data limitations, backups, and future cloud-sync path.

## 9. Important limitations

- Local-only data does not synchronize between iPhone and MacBook.
- Clearing browser/site data or switching devices can lose data unless exported.
- iOS browser storage may be evicted; do not imply it is permanent.
- Local storage is not a secure vault for sensitive financial data; do not collect account numbers or credentials.
- PWA offline behavior must be tested on a real iPhone; do not promise identical behavior across browsers.

## 10. Build order

1. Scaffold and design system.
2. Data model + repository + validation.
3. Dashboard, create/edit want, dependencies and unlock flow.
4. Purchase/archiving workflow.
5. IndexedDB persistence, export/import.
6. PWA/offline support.
7. Tests, polish, README, manual QA.

## 11. Definition of done

A person can install/open My Wants on their phone, add a want with exactly three dependencies, complete milestones, unlock and optionally mark purchased, and retain/export the data—all without an account or paid backend.
