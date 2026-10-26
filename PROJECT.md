# My Wants — Project Brief (v1 / MVP)

> **Note:** No `PROJECT.md` existed in the repository when the MVP was built.
> This file records the brief the MVP was built against, assembled from the
> build instructions. The **Assumptions** section lists every decision the
> brief left open. Edit this file if the product intent differs.

## Product

My Wants is a personal, mobile-first app for tracking discretionary purchases
("wants"). Each want is gated by **exactly three dependencies**: things the
owner commits to finishing first. A want **unlocks** only when all three are
complete. Only an unlocked want can be marked **purchased**.

Unlocking is a commitment device, **not** a judgment that the purchase is
affordable. The app must never present an unlock as proof of affordability.

## Constraints

- No extra monthly infrastructure cost. No cloud backend, Firebase, API keys,
  accounts, or paid services in v1.
- Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui.
- Local-first: data lives in IndexedDB on the device.
- JSON export and import for backup and moving devices.
- Installable PWA. Works offline after the first load.
- Excellent on iPhone (safe areas, touch targets, standalone display).
- Lean architecture: no Docker, microservices, or extra abstraction layers.

## Functional requirements

1. **Create a want** with a title, a price (amount + currency, default CAD),
   and exactly three dependencies, all required. An optional link and note.
2. **Edit a want**: title, price, link, note, and dependency wording.
3. **Toggle a dependency** complete or incomplete.
4. **Derived unlock state**: unlocked = all three dependencies complete. Never
   stored as its own field.
5. **Mark purchased**: allowed only when unlocked, behind a confirmation that
   says the unlock does not mean the purchase is affordable.
6. **Delete a want**, with confirmation.
7. **Views**: Locked (in progress), Unlocked (ready), Purchased.
8. **Clear 3-step progress** on every want (0/3 → 3/3).
9. **Export** all data to a JSON file. **Import** a JSON file with strict
   validation; invalid files are rejected with a readable error and nothing is
   changed.
10. **Empty state** with a one-tap sample want: *Lagavulin 16*, CAD 143.84,
    clearly marked **Sample** and removable.

## Acceptance criteria

- A want with fewer or more than three dependencies cannot be created,
  saved, or imported.
- A want cannot be marked purchased unless all three dependencies are done.
- Unchecking a dependency on an unlocked (not purchased) want locks it again.
- A purchased want's dependencies are frozen.
- Data survives a page reload and an app restart.
- Export → import round-trips with no loss.
- Import rejects malformed JSON, wrong shapes, duplicate IDs, and purchased
  wants with incomplete dependencies.
- The app loads and works offline after the first visit.
- No horizontal scroll at iPhone widths (375–430 px). Touch targets ≥ 44 px.
- Lint, typecheck, unit tests, and production build pass.

## Assumptions (brief left these open)

- **Import replaces** all current data, after a confirmation. No merging.
- **Purchase is final** in v1. There is no "undo purchase"; delete the want
  instead. Dependencies freeze on purchase.
- **Editing dependency wording keeps its completion state.**
- **Currency** is per want (ISO 4217 code), default CAD. No conversion.
- **Price is stored as integer minor units** (cents) to avoid float errors.
- **One screen** with sheets/dialogs. No routing needed.
- **Static export** (`output: "export"`) so the app can be hosted free on any
  static host. A hand-written service worker gives offline support.

## Out of scope for v1

Accounts, sync, sharing, notifications, budgets, price tracking, images,
categories, reminders, analytics.
