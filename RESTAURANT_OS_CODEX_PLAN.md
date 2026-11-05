# RestaurantOS — Codex Implementation Plan

**Version:** 1.0 · **Prepared:** November 4, 2026  
**Target:** One full-service restaurant in Seattle (approximately 40–60 seats), compatible with **Square Free and Square Plus**.

## 0. Product contract (read before writing code)

Build an internal, mobile-friendly restaurant management application to reduce paid back-office subscriptions and improve food-cost visibility. **Square remains the system of record for POS transactions, card payments, native checks, and the Square catalog.** RestaurantOS manages its own recipes, raw ingredient stock, purchasing, reservations, and reporting. Integrations are **read-only in v1**; never try to unlock Square Plus functionality on Square Free by altering Square checks.

### In scope for v1
- Owner/manager/host/inventory-staff login with access control.
- One Square-connected restaurant location, with location abstraction in the database.
- Square catalog, finalized orders, payment and refund imports; scheduled reconciliation.
- Ingredients, unit conversions, recipes (linked to Square catalog variations), recipe-level theoretical food cost.
- Ingredient receiving, supplier purchasing, waste, stock counts, low-stock flags.
- Table records, direct reservations, waitlist, host dashboard; no automatic Square table sync.
- Owner dashboard: net sales, menu item mix, theoretical food cost, food-cost percentage, estimated contribution margin, sales trends, reconciliation status.
- CSV exports, audit logs, responsive UI, synthetic demo seed data.

### Out of scope for v1
- Replacing Square POS or KDS; card capture, payments, tips, refunds initiated from RestaurantOS.
- Writing/editing Square's native dine-in checks, floor plans or tables.
- Payroll/tax computation or filings; advanced employee scheduling, time tracking, loyalty points, delivery dispatch, SMS marketing, marketplace reservation distribution, automated supplier ordering.
- Public multi-merchant SaaS and billing (prepare data model for multiple tenants, implement later).

### Success criteria
1. Owner can sign in and connect/enable a Square Sandbox integration.
2. Menu items and historical sales can be imported and re-imported without duplicates.
3. Owner can define a recipe and see correct ingredient cost, sales quantity, theoretical usage, and margin.
4. Staff can receive purchased ingredients, record waste, and reconcile a physical count, with an auditable quantity ledger.
5. Host can create, modify, cancel, and seat a reservation without conflicting table assignments.
6. Owner dashboard displays source/freshness timestamps and handles missing Square data honestly.
7. The application works with **either** Square Free or Square Plus without conditional dependence on paid POS features.

## 1. Technical stack and repo standards

- **Framework:** Next.js App Router + TypeScript in strict mode; route handlers/server actions where appropriate. Backend business logic lives in `src/server/` and is not coupled to React.
- **UI:** Tailwind CSS + shadcn/ui + accessible, responsive tables/forms.
- **Database:** PostgreSQL + Prisma (migrations committed); use `Decimal` for weights/volumes and integer cents for all money.
- **Auth:** Auth.js with secure sessions, email/password or magic link through established provider; do not implement custom password crypto. Role-based, location-scoped authorization on all server operations.
- **Validation:** Zod schemas shared across server form actions and API handlers.
- **Square:** Official current `square` Node SDK, behind an `SquareGateway` interface; pin Square API/SDK version and record it in docs. No browser-side Square secrets.
- **Background processing:** Durable sync jobs or cron-triggered idempotent workers with retries, alerts, and a manual `Sync now` action. Don't rely on Vercel request execution for long backfills; chunk work.
- **Testing:** Vitest for unit/service tests; Playwright for end-to-end; API/webhook contract tests; run on CI. Local Docker Compose for Postgres.
- **Deployment:** Vercel + managed Postgres (or another reliable deploy target). Keep infrastructure deployment-independent where feasible.
- **Timezone:** Store timestamps in UTC, store restaurant timezone (`America/Los_Angeles` by default), and calculate restaurant business day with a configurable close-of-day cutoff (e.g. 03:00 local).
- **Code style:** eslint, prettier, strict typing, clear service boundaries; migrations and seeds. Do not create a microservice architecture for one restaurant.

### Suggested folders

```
app/
  (public)/book/                 # Public reservation flow
  (auth)/login/
  (dashboard)/dashboard/
  (dashboard)/inventory/
  (dashboard)/recipes/
  (dashboard)/suppliers/
  (dashboard)/purchasing/
  (dashboard)/reservations/
  (dashboard)/tables/
  (dashboard)/reports/
  (dashboard)/settings/integrations/
  api/webhooks/square/
src/
  server/auth/
  server/db/
  server/square/                 # Adapter, sync, mapping, webhooks
  server/inventory/
  server/recipes/
  server/purchasing/
  server/reservations/
  server/reporting/
  lib/                           # validation, money, units, time
prisma/
tests/
docs/
```

## 2. Data model (minimum tables)

All business tables include `restaurant_id` and (where relevant) `location_id`. Use UUID primary keys for internal records; store Square's original IDs separately with unique composite constraints per merchant/location. Soft-delete or status-based archival for historical entities; do not cascade-delete financial history.

| Table | Minimum fields / purpose |
|---|---|
| `restaurants` | id, name, timezone, business_day_cutoff |
| `locations` | id, restaurant_id, name, square_location_id nullable |
| `users`, `memberships` | auth identity, restaurant_id, role (`OWNER`, `MANAGER`, `HOST`, `INVENTORY`, `VIEWER`), status |
| `square_connections` | restaurant_id, merchant ID, location ID, environment, connection status; secret reference only, never exposed |
| `square_catalog_objects` | Square object ID/version, item/variation/modifier type, canonical name, metadata, active flag, last synced |
| `square_orders`, `square_order_lines` | Square order ID/version/status/source, totals/tax/tip/discount, order time, item IDs, modifiers, quantity, captured snapshot |
| `square_payments`, `square_refunds` | Square IDs, status, order ID link, amount, tip, timestamps; no card numbers |
| `square_webhook_events` | unique event ID, type, received_at, processed_at, status, diagnostic error (sanitized) |
| `sync_cursors`, `sync_runs` | entity type, location, watermark, next cursor, retries, counts, success/error, last successful sync |
| `ingredients` | name, base unit (`g`, `ml`, `each`), reorder level, default supplier, active flag |
| `ingredient_packages` | supplier SKU, pack quantity, base-unit conversion, price cents, last purchase date |
| `recipes`, `recipe_versions`, `recipe_components` | Square catalog variation ID link, effective version, ingredient ID, quantity, yield, loss percent, base recipe or modifier delta |
| `suppliers` | name, contact, lead time, notes |
| `purchase_orders`, `purchase_order_lines` | statuses, supplier, requested quantities and estimated costs; partial receiving supported |
| `receipts`, `receipt_lines` | purchase receipt, actual quantity, actual unit price, receiving staff, timestamp |
| `stock_movements` | ingredient, signed decimal quantity in base unit, type (`RECEIPT`, `WASTE`, `ADJUSTMENT`, `SALE_THEORETICAL`), source ID, event time, actor, idempotency key |
| `stock_counts`, `stock_count_lines` | physical counts, counted_at, expected before adjustment, actual count, variance |
| `dining_tables` | number/name, capacity, combinable group, active status; RestaurantOS-specific only |
| `reservations` | name, contact, party size, start, expected end, table assignment, status, notes, consent fields |
| `waitlist_entries` | customer, party size, join time, estimated wait, status, assigned table |
| `audit_logs` | actor, record type/id, action, before/after (redacted), timestamp |

### Essential integrity rules
- Use transactions and unique constraints for idempotent receipts, Square imports, and stock postings.
- Money uses integer minor units; quantities use decimal, never IEEE float for accounting.
- Recipe costs must be reproducible using a timestamped ingredient cost basis (at minimum last received cost with cost snapshots; future upgrade to weighted average).
- Recipe mapping must be **per Square catalog variation**, optionally per modifier with recipe additions/subtractions. Unmapped items show `Unmapped`, not zero cost.
- Sale sync updates must compute deltas/reverse prior theoretical stock movements so a modified or refunded order is not counted twice. Do not infer real-time raw ingredient stock from unpaid POS orders.
- Separate `estimated/theoretical` ingredient usage from physical stock counts; mark inventory balance as an estimate between counts.
- Reservation conflict validation must happen inside a database transaction/concurrency-safe allocation routine, not only in the UI.
- Distinguish Square order time, payment time, and business day. Refunds and voids must have explicit, testable reporting treatment.

## 3. Square integration contract (most important)

**Read-only v1 permissions:** `MERCHANT_PROFILE_READ`, `ITEMS_READ`, `ORDERS_READ`, and `PAYMENTS_READ` where needed. Request only scopes supported by the chosen auth method and API. For one privately operated Square account, a protected server-side production personal access token is a valid integration approach; for future merchant-facing SaaS use OAuth. Do not put either in source code, logs, browser, or `.env.example` values.

### Implement an adapter

```
interface SquareGateway {
  getLocations(): Promise<NormalizedLocation[]>;
  listCatalogChanges(since?: string): Promise<NormalizedCatalogPage>;
  searchOrders(params: OrderSearchParams): Promise<NormalizedOrderPage>;
  listPayments(params: PaymentSearchParams): Promise<NormalizedPaymentPage>;
  listRefunds(params: RefundSearchParams): Promise<NormalizedRefundPage>;
}
```

Implement `SquareSandboxGateway`, `SquareProductionGateway`, and `FakeSquareGateway` sharing normalization. Return typed errors and honor pagination/rate limits.

### Sync workflow
1. Configure credentials, environment, merchant/location ID; test connection server-side.
2. Initial catalog import; store item variation IDs, names, modifiers, versions. Treat Square as catalog source of truth.
3. Backfill historical orders in date chunks via `SearchOrders` (configure 30 or 90 days). Iterate all pages; upsert by Square ID/version; store raw sanitized payload snapshots for debugging if approved.
4. Import payments and refunds to reconcile revenue, reversals, and tips; do not equate payments with menu-line-level sales.
5. Subscribe to relevant events such as `catalog.version.updated`, `order.updated`, `payment.created`, `payment.updated`, and refund events *after verifying availability and behavior in the pinned Square API version*. Use webhooks to mark records dirty and enqueue re-fetches, not to blindly mutate balances.
6. Verify webhook signature against **raw request body**, exact callback URL, and signature key. Reject invalid signatures; deduplicate on event ID; acknowledge promptly and process in a durable worker.
7. Poll `SearchOrders` regularly with overlap (e.g. each 15 minutes, configurable), plus nightly reconciliation of at least the preceding 7 business days. Respect rate limits. Include a larger manual backfill/replay utility.
8. Track `last_successful_sync_at`, failures, mismatches, and sync age; prominently warn about stale data. Offline Square POS orders may arrive late (up to 72 hours).

**Critical integration caveat:** Do not rely on the `order.created` webhook to catch Square POS-created orders. The current Square API reference specifically says POS creation does not emit that event, and other Square resources are inconsistent. Prove behavior using real devices and use polling/reconciliation regardless. This also means RestaurantOS is **not** a guaranteed real-time KDS or authoritative live dine-in order display.

Square's public APIs also do not provide a dependable complete contract for native dining room floor plans / editable unpaid dine-in checks. Keep reservations and seating inside RestaurantOS, checks inside Square. Never claim automatic two-way table sync in v1.

## 4. Phased implementation with acceptance gates

### Phase 1 — Foundation and UX skeleton
**Build:** Next.js app; Postgres + Prisma migration; Auth.js; protected dashboard; roles; restaurant/location settings; navigation and empty states; accessible reusable components; Docker Compose; demo seed; CI with lint/typecheck/tests.  
**Screens:** login, owner home, settings, integration status, skeleton navigation for other modules.  
**Acceptance:** unauthorized users cannot read/write business records; demo data starts with one command; mobile layout works; all tests and CI pass.

### Phase 2 — Square read-only integration
**Build:** fake and sandbox Square gateways; connection test; locations; catalog import; Square variation-to-local mapping screen; order/payment/refund backfill; sync status page; webhook endpoint with HMAC verification; manual and scheduled reconciliation; failure retry + alert.  
**Screens:** Square connection, sync runs, imported catalog, imported sales, mapping exceptions.  
**Acceptance:** repeated imports produce identical totals and zero duplicates; signed event accepted, forged event rejected; payments/refunds reconcile to imported orders where linked; late/offline and changed orders handled; app functions if Square unavailable, labeling data stale.

### Phase 3 — Ingredients and recipe costing (highest-value feature)
**Build:** ingredient CRUD; base unit normalization (mass, volume, count), purchase pack conversions; recipe builder linked to Square variation; recipe versions; ingredient and per-dish costs; recipe yield/waste percent; optional modifier recipe adjustments; unmapped-item queue.  
**Screens:** ingredients, recipe editor, food cost per dish, mapping health.  
**Acceptance:** example recipe with correct unit conversion and costs; price changes recalc new theoretical cost; historic snapshots retained; missing ingredient/recipe cost is marked unknown and excluded from misleading margins.

### Phase 4 — Purchasing, stock & waste
**Build:** supplier directory; purchase orders; partial goods receiving; ingredient price history; stock ledger; waste reason codes; stock counts and variance; reorder list; CSV export; manual correction with required reason.  
**Screens:** suppliers, PO list/details, receive inventory, stock count, waste entry, low stock.  
**Acceptance:** partial receipt adds only actual delivered quantity; repeated callback/import cannot double add/deduct; physical count adjusts balance with an audit trail; stock cannot be silently changed by editing an old receipt; permissions enforced.

### Phase 5 — Reservations and waitlist
**Build:** capacity and combinable tables; configurable durations, buffers, opening hours, blocked dates; public `/book` form; host calendar/day view; reservation edit/cancel/seat/no-show; waitlist; optional transactional confirmation email.  
**Screens:** public booking, manager availability, host grid, waitlist.  
**Acceptance:** two simultaneous customers cannot book same table/time window; party-size capacity checks; cancellation releases slot; no automatic Square table/check sync; timezones and DST tested; server-side rate limits and anti-spam; consent/privacy retention controls.

### Phase 6 — Analytics and reconciliation
**Build:** total/net sales, menu quantity by variation, top dishes, theoretical cost, food-cost %, gross contribution margin (not accounting net profit), spend by supplier, waste, low stock, daily trend; sales-vs-payment audit reports; export CSV.  
**Screens:** executive dashboard, date/location filters, menu profitability, reconciliation queue.  
**Acceptance:** tax and tips excluded from menu revenue; discounts/refunds explicitly allocated or documented as unallocated; missing mappings show data quality warnings; totals reconcile to test fixtures; changes in Square source update reports without double counting.

### Phase 7 — Optional, only after v1 accepted
- Staff checklists and closing/opening routines.
- Schedule availability / shift requests (do not handle payroll).
- Supplier delivery reminders, weekly purchasing recommendations.
- Email newsletters/loyalty only if Square's included features don't satisfy needs and explicit marketing opt-in exists.
- Better forecast and recipe cost history.
- Multi-location and merchant OAuth when expanding to a SaaS product.
- Never prioritize custom KDS or tableside payment processing simply to save small monthly Square fees.

## 5. Server API and UI contracts

Start with typed server actions for authenticated internal forms and route handlers where clients/external consumers need an HTTP API. Suggested endpoints (refine if better idiomatic Next.js approach):

```
GET    /api/integrations/square/status
POST   /api/integrations/square/test
POST   /api/integrations/square/sync            # owner-only
POST   /api/webhooks/square                     # HMAC verified
GET    /api/inventory/ingredients
POST   /api/inventory/ingredients
POST   /api/inventory/receipts
POST   /api/inventory/waste
POST   /api/inventory/stock-counts
GET    /api/recipes
POST   /api/recipes
GET    /api/reports/food-cost
GET    /api/reports/sales
GET    /api/reservations/availability            # public; rate limited
POST   /api/reservations                       # public; rate limited
PATCH  /api/reservations/:id                   # authorized staff
```

Every mutation: parse and validate with Zod; authenticate/authorize; scope by restaurant; use database transaction; return stable structured errors; add audit log on sensitive operations. Public booking responses must not leak names or other reservations.

## 6. Critical tests — implement before production

**Security:** access-control matrix; cross-tenant IDOR attempt; public booking spam; fake Square webhook signature; leaked secret scan; audit log privacy.  
**Sync:** pagination, retries, duplicate/out-of-order events, API outage, overlapping reconciliation, changed order line, refund after sale, offline delayed arrival; stale data labeling.  
**Costs:** kg↔g, L↔ml, package↔base-unit, fractional quantities, yields, modifier additions, zero/missing cost vs true zero; rounding tests.  
**Inventory:** double receipt prevention, purchase partials, wasted items, count adjustment, stock delta on sale correction/refund.  
**Reservations:** same slot concurrency, seat capacity, cancellation, combining tables, DST transitions, restaurant cutoff dates.  
**Analytics:** refund/discount/tip/tax exclusions and partial mappings.  
**E2E:** owner login → sync mock catalog → build recipe → receive stock → import fake sale → view food cost → book table.

No real production credentials in automated tests. Use seed fixtures and a fake Square adapter. For real integration verification, run controlled Square Sandbox exercises, then separately verify POS-originated events/orders on actual Square devices with minimal live-test exposure before launch.

## 7. Operational and deployment requirements

- Provide `.env.example` with **names but no secret values**: `DATABASE_URL`, `AUTH_SECRET`, `SQUARE_ENV`, `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`, `CRON_SECRET`, `EMAIL_API_KEY` (optional).
- Validate environment on startup, use server secrets manager in production, HTTPS, secure cookies, least-privilege access, rate limits, CSP where feasible.
- DB backups with restore test; data retention policy for reservation personal data; no card number or payment tokens stored. Log only redacted data.
- Daily sync health check, visible failures, retry pathway; no silent skipped imports. Handle Square token rotations and disabled access.
- Screens should be mobile-first for staff, desktop-first for owner reporting, usable with gloves/wet kitchen workflows where applicable.
- Document manual fallback: if RestaurantOS is down, Square still takes payments and prints/handles restaurant orders; reservations can be exported for front desk use.

## 8. Output required from Codex after **each phase**

1. Implement working code and DB migration (not pseudocode).
2. Add/update automated unit + integration/E2E tests.
3. Run and report `typecheck`, `lint`, `test`, and build results.
4. Update `README.md`, `docs/architecture.md`, `docs/decisions.md`, and `docs/progress.md`.
5. Document any limitations, known bugs, and setup actions requiring user credentials or actual Square access.
6. Present concise summary: files changed, migrations, tests run, screenshots if available, next-phase dependencies.
7. **Stop at phase boundary.** Do not implement the next phase without an explicit instruction.

If any integration fact is uncertain, check the current official Square documentation and record the finding. Never fabricate undocumented endpoints or claim native POS integration that doesn't exist. Mock anything requiring credentials until they are provided securely.

## 9. Copy-paste Codex kickoff prompt

> Read `RESTAURANT_OS_CODEX_PLAN.md` thoroughly. You are the lead full-stack engineer for this project. Follow its product contract, database integrity requirements, Square API limitations, security rules, and phase acceptance gates. **Implement Phase 1 ONLY**, creating actual runnable files in this repository. Use Next.js App Router, strict TypeScript, Prisma/PostgreSQL, Auth.js, Tailwind/shadcn, Zod, Vitest, Playwright, and Docker Compose. Create a professional responsive dashboard skeleton, role-based authentication, one-restaurant seed data, migrations, `.env.example` with placeholders, README, and phase-progress docs. Do not require actual Square credentials or integrate payments. Run build/typecheck/lint/tests, fix failures, and report exact commands and results. Stop after Phase 1 and list what is required for Phase 2. Make sound choices without asking about minor preferences, but never hardcode secrets or pretend that an external integration has been tested.

## 10. Official references for Codex

- Orders API and `SearchOrders`: https://developer.squareup.com/reference/square/orders
- Order creation webhook caveat: https://developer.squareup.com/reference/square/orders-api/webhooks/order.created
- POS-originated order visibility: https://developer.squareup.com/docs/orders-api/what-it-does
- Webhook event rules and retries: https://developer.squareup.com/docs/webhooks/overview
- Signature verification: https://developer.squareup.com/docs/webhooks/step3validate
- Catalog sync: https://developer.squareup.com/docs/catalog-api/webhooks
- Locations: https://developer.squareup.com/docs/locations-api
- Payments list: https://developer.squareup.com/reference/square/payments/ListPayments
- Refunds: https://developer.squareup.com/reference/square/refunds
- Square Node SDK: https://developer.squareup.com/docs/sdks/nodejs
- Personal tokens vs merchant OAuth: https://developer.squareup.com/docs/build-basics/access-tokens
