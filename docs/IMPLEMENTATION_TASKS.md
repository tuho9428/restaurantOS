# Dependency-ordered implementation tasks

Planning only: none of the tasks below authorizes application implementation in this chat. Execute them only when the user subsequently requests coding. Read all eight planning documents first. Task IDs are stable; dependencies are direct prerequisites, not merely suggested order. Tasks are listed in a topological order. Optional post-v1 ideas are in PRD and are not tasks here.

Each task is one reviewable change, generally one small PR (about half to one working day); if a task exceeds that, split it into child IDs while preserving its acceptance contract before starting. File paths below are future paths, relative to repository root; they do not indicate existing code. Never create application code just to mark a planning task complete.

Shared definition of done: implement only the task scope; shared Zod contract and authorization applied; required audit/idempotency included on mutations; relevant tests pass on PostgreSQL where integrity is involved; typecheck/lint pass, build when imports/routes change; no secrets or unverified claims; update task status and actual test commands/results. For a documentation/evidence-only task, run its specified review/structural checks and record application commands as not applicable; do not scaffold code only to run them. Every individual task below adds its own completion condition. Required tests belong in the named unit/integration/E2E categories in TESTING; do not substitute mocks for concurrency/database constraints. Do not expand tests beyond the changed risk without a reason.

Schema batches are DATABASE's 001_identity_tenancy, 002_jobs_idempotency, 003_square_sources, 004_ingredients_recipes, 005_purchasing_stock, 006_reservations, 007_reporting_hardening. Each migration belongs to exactly one task; later tasks may add a new named additive migration but must never rewrite an applied migration. Some service tasks intentionally follow schema creation by multiple tasks.

## Foundation (T001-T010)

### T001: Freeze dependency and external-evidence baseline

- **Task ID:** T001
- **Objective:** Freeze dependency and external-evidence baseline.
- **Dependencies:** None.
- **Files or modules:** docs/IMPLEMENTATION_TASKS.md; docs/DEPENDENCY_BASELINE.md; package manifest/lockfile when implementation starts.
- **Detailed behavior:** Resolve exact supported versions of Next.js, React, TypeScript, Auth.js and its adapter, Prisma, Zod, Tailwind/shadcn, Vitest, Playwright, and Node from official sources. Use PostgreSQL 17, square@46.0.0 with API 2026-09-16, and the Taste commit pinned in UI_DESIGN. Record installation commands, licenses, and compatibility decisions before installing dependencies.
- **Edge cases:** Auth.js compatibility that requires a prerelease; SDK API rewrites; changes to Taste's main branch; unavailable database extensions.
- **Acceptance criteria:** A reproducible compatibility matrix identifies exact versions. Production dependencies do not rely solely on latest tags or version ranges, and external verification is not fabricated.
- **Required tests:** Review official package metadata, peer-dependency requirements, engine support, and documented SDK/API compatibility. Installation and the initial build belong to T002; Prisma generation belongs to T003. Defer live Square evidence to T066 and T067.
- **Definition of done:** Shared definition of done, plus exact dependency pins and documented external verification gates. Later tasks use this baseline without independently choosing another stack.
- **Status:** COMPLETE (2026-11-04 America/Los_Angeles). Exact pins, license/peer/engine review, supported-version decisions, reproducible T002 install commands and deferred gates are recorded in [DEPENDENCY_BASELINE](DEPENDENCY_BASELINE.md). Metadata checks passed; no application build or tests were expected in T001.

### T002: Create runnable Next.js toolchain

- **Task ID:** T002
- **Objective:** Create runnable Next.js toolchain.
- **Dependencies:** T001.
- **Files or modules:** package.json; package-lock.json; app/layout.tsx; app/page.tsx; app/globals.css; instrumentation.ts; src/server/env.ts; src/server/env-schema.ts; src/server/env-schema.test.ts; tests/contracts/server-boundary.test.ts; scripts/worker-not-implemented.mjs; tsconfig.json; next.config.ts; eslint.config.mjs; postcss.config.mjs; vitest.config.ts; playwright.config.ts; components.json; .prettierrc.json; .prettierignore; .nvmrc; .gitignore; .env.example; README.md; generated AGENTS.md.
- **Detailed behavior:** Scaffold a strict TypeScript App Router application with Node runtime, Tailwind v4, and owned shadcn component paths. APP_ENV is the deployment security environment; NODE_ENV is the build optimization flag, so production-built test artifacts can use synthetic fixtures while APP_ENV=production rejects fake/capture/demo modes. Add build, typecheck, lint, test:unit, test:integration, test:contracts, test:e2e, db:migrate, and worker scripts, with explicit environment validation. Use an offline system sans stack and the validated webpack production build command until the Next 16 Turbopack PostCSS worker issue is resolved. Install Prisma packages without a schema or client generation. Do not add business features in this task.
- **Edge cases:** Fake-adapter flags in production; missing environment values; accidentally creating both app/ and src/app/; server secrets entering browser bundles.
- **Acceptance criteria:** A fresh installation builds the placeholder route with the documented APP_ENV and no Prisma schema or generated client. Nonproduction starts without Square credentials, and production rejects unsafe demo flags.
- **Required tests:** Build, typecheck, lint, and environment-validation unit tests; verify browser bundles cannot import server environment modules.
- **Definition of done:** Shared definition of done, plus documented execution commands and no real secret values.
- **Status:** COMPLETE (2026-11-04 America/Los_Angeles / 2026-11-05 UTC). T002 scaffold and exact lockfile are present. ESLint was amended to 9.39.5 after the Next config plugin peer tree rejected ESLint 10; `npm install --no-audit --no-fund`, a clean `npm ci --no-audit --no-fund`, and `npm ls --all` exit 0 without peer errors. The build uses `next build --webpack`: Turbopack 16.4.5 on this Windows host panics while launching its PostCSS worker (`node process exited before we could connect to it with exit code: 0`), including outside the sandbox; webpack compiles the same CSS and placeholder route. T002 uses an offline system sans stack; no `next/font/google` imports remain. With `APP_ENV=test`, `npm run build` exits 0 and prerenders `/` and `/_not-found`. `npm run lint`, `npm run typecheck`, `npm run format`, `npm run format:check`, `npm run test` (8 unit tests), and `npm run test:contracts` (3 tests, rerun after build to inspect browser output) all exit 0. Integration and E2E scripts exit 0 with no test files. Prior local development startup reached Ready without Square credentials, and unit tests confirm production rejects FAKE/CAPTURE/demo flags. T003 now owns the first schema, Prisma Client generation, and migrations; no T002 code imports an ungenerated client. Validation ran on Node 24.14.1/npm 11.17.0, while deployment remains pinned to Node 24.22.2. No secret `.env` file is present. T003 is dependency-ready.

### T003: Create tenant, identity and policy schema

- **Task ID:** T003
- **Objective:** Create tenant, identity and policy schema.
- **Dependencies:** T002.
- **Files or modules:** prisma/schema.prisma; prisma/migrations/001_identity_tenancy; src/server/db; compose.yaml.
- **Detailed behavior:** Create the initial Prisma schema and configuration, generate Prisma Client, then implement the identity, authentication, membership, location, audit, and business-day policy structures defined in DATABASE, including composite scope keys. Configure PostgreSQL 17 in Compose and separate pooled runtime connections from direct migration connections. Seed one restaurant and location, use UTC instants, and persist explicit location grants. Install btree_gist in migration 001 before business-day policy exclusion constraints; later recipe and reservation migrations reuse the extension.
- **Edge cases:** Global Auth.js identities versus tenant-owned business records; the last-owner invariant requires a service transaction; restricted extension privileges during migration.
- **Acceptance criteria:** The first Prisma Client generates from the reviewed schema and the migration applies to an empty database. Cross-scope foreign-key inserts fail, and business history cannot be deleted through cascading relations.
- **Required tests:** Prisma Client generation, real PostgreSQL migration tests, composite foreign-key rejection tests, and an Auth.js adapter schema smoke test.
- **Definition of done:** Shared definition of done, plus reviewed and committed migration SQL. Production setup does not use prisma db push.

### T004: Implement numeric, units and restaurant-time primitives

- **Task ID:** T004
- **Objective:** Implement numeric, units and restaurant-time primitives.
- **Dependencies:** T002.
- **Files or modules:** src/lib/money.ts; units.ts; business-time.ts; tests/unit/lib.
- **Detailed behavior:** Implement strict integer-string cents, Decimal quantities and rates, and half-up rounding with negative ties away from zero. Normalize g/kg, ml/L, and each within compatible dimensions. Implement zoned business-day boundaries, effective policy versions, DST cutoff disambiguation, and half-open [from, to) windows as specified in ARCHITECTURE.
- **Edge cases:** Fractional each quantities; overflow; conversions requiring unavailable density; nonexistent or repeated local times; zero or negative denominators.
- **Acceptance criteria:** Documented numeric examples match exactly. Time utilities are independent of the host timezone, and invalid unit conversions are rejected.
- **Required tests:** Unit tests for kg/g, L/ml, negative rounding ties, one-cent allocation, Decimal precision, DST spring/fall transitions, and the 03:00 cutoff.
- **Definition of done:** Shared definition of done, plus deterministic pure functions and shared scalar contract schemas.

### T005: Implement invited magic-link authentication and bootstrap

- **Task ID:** T005
- **Objective:** Implement invited magic-link authentication and bootstrap.
- **Dependencies:** T003.
- **Files or modules:** src/server/auth/config.ts; app/api/auth/[...nextauth]/route.ts; app/(auth)/login; scripts/bootstrap-owner.ts.
- **Detailed behavior:** Use Auth.js with Prisma database sessions, the SMTP provider, 15-minute links, and 12-hour sessions. Bootstrap an explicit owner through the CLI. Permit sign-in only for known invited identities, and persist the last fresh authentication time. Production has no authentication bypass or password login. Document the local email sink. The database session also receives its random business CSRF synchronizer token; missing-token legacy sessions must reauthenticate.
- **Edge cases:** Expired or reused links; email enumeration; disabled identities; mail delivery failure; redirects to external callback URLs.
- **Acceptance criteria:** The owner can authenticate through captured local email. An unknown email receives a generic response without obtaining an account. Production rejects email-sink and bypass configurations.
- **Required tests:** Auth.js adapter integration tests; link expiry and single-use tests; redirect allowlist and session-revocation tests; login E2E.
- **Definition of done:** Shared definition of done, plus secure cookie and CSRF configuration. No custom password or cryptographic implementation is introduced.

### T006: Enforce scoped RBAC and safe read boundaries

- **Task ID:** T006
- **Objective:** Enforce scoped RBAC and safe read boundaries.
- **Dependencies:** T005.
- **Files or modules:** src/server/auth/context.ts; policy.ts; scoped repositories; src/contracts/me.ts; GET /api/v1/me.
- **Detailed behavior:** Implement the PRD permission matrix for OWNER, MANAGER, HOST, INVENTORY, and VIEWER, with explicit location grants. Reload membership for every operation. Enforce service guards and DTO allowlists independently of layout checks. Provide reusable last-owner locking and fresh-login guards.
- **Edge cases:** Foreign resource IDs; stale roles or sessions; aggregate and export leaks; owners without location grants; invalid background-job scope.
- **Acceptance criteria:** Foreign-scope resources return 404, unauthenticated access returns 401, and disallowed actions return 403. Role demotion takes effect on the next operation.
- **Required tests:** Complete permission-matrix unit tests, two-tenant/two-location IDOR integration tests, and Server Component cache-isolation tests.
- **Definition of done:** Shared definition of done, plus an explicit scope parameter for every public repository function.

### T007: Implement transactional mutation, audit and HTTP infrastructure

- **Task ID:** T007
- **Objective:** Implement transactional mutation, audit and HTTP infrastructure.
- **Dependencies:** T003, T004, T006.
- **Files or modules:** prisma/migrations/002_jobs_idempotency; src/server/audit; idempotency; http; src/contracts/errors.ts.
- **Detailed behavior:** Add request IDs, Zod validation and the shared error envelope, body limits, same-origin and CSRF enforcement, persistent rate-limit buckets, and idempotency body hashing with a unique request claim. Replay the exact original successful status and response. Commit audit records and the successful response with the business transaction. Add the durable job and schedule metadata schema from DATABASE. Migration 002 also creates notification_deliveries, operational_state, and durable schedule metadata; reservation-dependent notification foreign keys are added in migration 006. Implement authenticated GET /api/v1/csrf and constant-time validation of the current session token on custom staff writes; no unlisted client token source is assumed.
- **Edge cases:** The same key with a changed body; concurrent use of one key; transaction rollback; audit failure; seven-day cache expiry; PII in stored responses.
- **Acceptance criteria:** Repeated requests cannot duplicate effects. A successful mutation requires durable audit, and rollback releases the request-key claim.
- **Required tests:** Real database tests for concurrent replay, hash mismatch, forced transaction and audit failures, CSRF rejection, and 413/415 responses.
- **Definition of done:** Shared definition of done, plus a documented transaction helper and redaction allowlist.

### T008: Build accessible app shell and reusable UI primitives

- **Task ID:** T008
- **Objective:** Build accessible app shell and reusable UI primitives.
- **Dependencies:** T002, T005, T006.
- **Files or modules:** app/(dashboard)/layout.tsx; src/components/ui; src/components/domain; app/globals.css.
- **Detailed behavior:** Implement UI_DESIGN tokens, a single shadcn foundation, sidebar and mobile navigation, page headers, data tables, form fields and errors, and loading, empty, error, and data-quality states. Use Server Components by default and client components for leaf interactions. Role-filtered destinations still enforce server guards.
- **Edge cases:** Navigation at 390px; long labels; keyboard focus; empty pages; reduced motion; session expiry.
- **Acceptance criteria:** Every specified destination has a role-appropriate working empty state. Focus is visible, and the page has no unintended horizontal overflow.
- **Required tests:** Component interaction and accessibility checks, plus Playwright snapshots of the responsive application shell.
- **Definition of done:** Shared definition of done, plus documented token mappings and no invented business metrics.

### T009: Implement owner settings and membership administration

- **Task ID:** T009
- **Objective:** Implement owner settings and membership administration.
- **Dependencies:** T006, T007, T008.
- **Files or modules:** src/server/settings; src/server/auth/memberships; app/api/v1/settings; memberships; app/(dashboard)/settings.
- **Detailed behavior:** Implement typed settings and name updates, prospective timezone/cutoff policy changes, membership invitation and role/status changes, an audit viewer, and owner administration UI. Apply fresh-authentication checks and the locked last-owner invariant. Activate invitations only after verifying the invited email identity. Prepare the invitation delivery handler and durable outbox job. Invited users can request an ordinary Auth.js login immediately; queued invitation notices begin delivery when worker T011 is available. Do not claim a queued notice was sent.
- **Edge cases:** Concurrent owner demotions; invitation retries; timezone changes after historical sales exist; unavailable SMTP; foreign location grants.
- **Acceptance criteria:** The owner can provision every role. The last owner cannot be removed, and historical business dates retain their original policy snapshots.
- **Required tests:** Membership concurrency, policy-version selection, reauthentication error, role administration E2E, and invitation deduplication tests.
- **Definition of done:** Shared definition of done, plus audit snapshots that exclude contact details and secrets.

### T010: Provide reproducible demo, CI and foundation acceptance gate

- **Task ID:** T010
- **Objective:** Provide reproducible demo, CI and foundation acceptance gate.
- **Dependencies:** T004, T005, T007, T008, T009.
- **Files or modules:** prisma/seed.ts; .github/workflows/ci.yml; README.md; tests/e2e/foundation.
- **Detailed behavior:** Provide an idempotent, nonproduction-only seed containing synthetic tenant data, staff roles, an unconfigured integration, and realistic UI examples. CI installs locked dependencies, provisions PostgreSQL, applies migrations, and runs typecheck, lint, unit/integration tests, build, and smoke E2E. Document the exact commands. The unconfigured integration is an empty-state DTO derived from no connection, not a square_connections seed: Square tables do not exist until T012.
- **Edge cases:** Accidentally seeding production; repeated seed runs; missing email sink; running a repository fork without secrets.
- **Acceptance criteria:** The documented local setup works from a fresh checkout. All foundation checks pass without Square credentials.
- **Required tests:** Fresh database setup and a second seed run; navigation and session checks for every role; CI artifact smoke checks.
- **Definition of done:** Shared definition of done, plus foundation acceptance evidence. Stop here if a later coding request authorizes Phase 1 only.

## Square ingestion and operations (T011-T020)

### T011: Build durable worker, scheduler and lease recovery

- **Task ID:** T011
- **Objective:** Build durable worker, scheduler and lease recovery.
- **Dependencies:** T007, T010.
- **Files or modules:** src/server/jobs; src/worker/main.ts; app/api/internal/schedules/tick/route.ts; worker deployment config.
- **Detailed behavior:** Implement database claiming with SKIP LOCKED, a fenced 120-second lease, a 30-second heartbeat, bounded 45-second work, eight transient retry attempts, unique scheduled occurrences, and visible dead jobs. The worker uses the same release and domain services as the web application. No database transaction spans a network call. The scheduler only inserts due jobs. Register the invitation notification handler prepared by T009; SMTP delivery remains retryable and separate from Auth.js login-token mail.
- **Edge cases:** Worker failure after fetching but before committing; a stale lease owner; duplicate scheduler ticks; 401/403 responses; 429 with Retry-After.
- **Acceptance criteria:** Two workers claim work safely. An expired worker cannot commit, and restarting a stopped worker resumes durable work without losing checkpoints.
- **Required tests:** Real PostgreSQL tests for multiple-worker claims and fencing, crash recovery, backoff, duplicate scheduler ticks, and scheduler authentication.
- **Definition of done:** Shared definition of done, plus worker heartbeat reporting and graceful shutdown.

### T012: Create Square canonical import schema

- **Task ID:** T012
- **Objective:** Create Square canonical import schema.
- **Dependencies:** T011.
- **Files or modules:** prisma/migrations/003_square_sources; prisma/schema.prisma; src/server/square/repositories.
- **Detailed behavior:** Implement connection identity by merchant/environment, catalog objects, orders, lines, modifiers, return links, payments, refunds, webhook inbox, cursors, runs, and reconciliation issues from DATABASE. Source identity remains independent of credentials. Preserve tombstones and unresolved external references. Migration 003 includes source return headers/line links and refund allocation revision/line structures; T050 must not recreate them.
- **Edge cases:** Token rotation; identical source IDs in sandbox and production; merchant-wide catalog objects; references resolved after their dependent records arrive.
- **Acceptance criteria:** Duplicate external IDs cannot coexist within one connection. Normalized records exclude card and customer payloads.
- **Required tests:** Migration uniqueness and scope tests, plus sanitization assertions against canary fixtures.
- **Definition of done:** Shared definition of done, plus indexed source lookups and immutable source identity.

### T013: Implement fake and pinned Square gateways

- **Task ID:** T013
- **Objective:** Implement fake and pinned Square gateways.
- **Dependencies:** T001, T004, T012.
- **Files or modules:** src/server/square/gateway.ts; gateways/fake.ts; gateways/square.ts; normalizers; tests/fixtures/square.
- **Detailed behavior:** Implement the interface, endpoint allowlist, and error taxonomy in SQUARE_INTEGRATION with the pinned official SDK. Sandbox and production factories share normalization. Apply timeouts and explicit pagination inputs, and serialize money and source versions as strings. The fake gateway provides deterministic pages and errors.
- **Edge cases:** Unknown enums or currency; missing modifier IDs; BigInt JSON serialization; invalid versions; 429, 5xx, or 401 responses; SDK cursor field differences.
- **Acceptance criteria:** Every allowed read is supported by the fake adapter. No gateway mutation method exists, secrets remain server-only, and no live verification is claimed.
- **Required tests:** Gateway contract tests against the fake and sanitized official-style fixtures, plus HTTP endpoint-allowlist spy tests.
- **Definition of done:** Shared definition of done, plus the recorded SDK/API pair and sanitized transport errors.

### T014: Implement Square configuration, identity verification and status

- **Task ID:** T014
- **Objective:** Implement Square configuration, identity verification and status.
- **Dependencies:** T006, T007, T013.
- **Files or modules:** src/server/square/connections.ts; app/api/v1/integrations/square/{configure, test, status}.
- **Detailed behavior:** Resolve the fixed deployment secret alias, retrieve the merchant and locations, and verify merchant identity, active location, USD currency, and environment. Persist verified identity and connection status. Initial configuration uses expectedVersion:null; later changes are versioned and require a freshly authenticated owner. Status reports ingestion and projection freshness separately.
- **Edge cases:** Token/account/environment mismatch; revoked token; missing location; credential rotation that must preserve connection identity.
- **Acceptance criteria:** Valid fake or sandbox configuration activates the connection. Incorrect identity cannot import data. Managers can read status without accessing credential configuration.
- **Required tests:** Scope, fresh-authentication, identity-mismatch, token-rotation, and sanitized status contract tests.
- **Definition of done:** Shared definition of done, plus browser forms that never accept credential values.

### T015: Implement complete catalog import and tombstones

- **Task ID:** T015
- **Objective:** Implement complete catalog import and tombstones.
- **Dependencies:** T011, T013, T014.
- **Files or modules:** src/server/square/sync/catalog.ts; catalog repository; fixture pages.
- **Detailed behavior:** Use SearchCatalogObjects with explicit nested variation/modifier types and deleted objects. Overlap the exclusive begin_time boundary, and follow every cursor page. Upsert only newer versions while retaining location-presence rules and parent links. Commit each page with its checkpoint atomically.
- **Edge cases:** Deletions and archived items; nested objects whose parents are absent; equal or stale versions; exclusive timestamp boundaries; invalid cursors.
- **Acceptance criteria:** A second unchanged import causes no effective catalog changes. A deleted variation remains linked to its historical recipe and sales.
- **Required tests:** Integration tests for multiple pages, tombstones, nested object types, location availability, source versions, and page restart.
- **Definition of done:** Shared definition of done, plus no deletion inferred from absence on one page.

### T016: Implement canonical order, return and exchange ingestion

- **Task ID:** T016
- **Objective:** Implement canonical order, return and exchange ingestion.
- **Dependencies:** T012, T013, T015.
- **Files or modules:** src/server/square/sync/orders.ts; normalizers/orders.ts; order repositories.
- **Detailed behavior:** Normalize every observed state, the order's own sale lines and modifier snapshots, return-source links, and original monetary totals. A newer numeric version wins; an identical version/hash is a no-op. Enqueue projection in the source transaction. Preserve missing catalog references as exceptions, and bind the first accepted close time for inventory.
- **Edge cases:** Offline arrival; custom lines; zero-price comps; new sale lines in exchanges; changes to source close time; late cancellation.
- **Acceptance criteria:** Repeated or out-of-order imports cannot duplicate line or sale identities. A changed close timestamp requires review before inventory reprojection.
- **Required tests:** Fixtures for changed/deleted lines, return-only orders, exchanges, canceled/open orders, missing close time, and version guards.
- **Definition of done:** Shared definition of done, plus stored source close times, reporting-policy snapshots, and data-quality reasons.

### T017: Implement payment/refund ingestion without double revenue

- **Task ID:** T017
- **Objective:** Implement payment/refund ingestion without double revenue.
- **Dependencies:** T012, T013, T016.
- **Files or modules:** src/server/square/sync/payments.ts; refunds.ts; normalizers; repositories.
- **Detailed behavior:** Import all statuses using updated-at overlap and broad explicit creation bounds. Guard changes by source timestamp and normalized hash, and refetch canonically when equal timestamps have different hashes. Preserve source order/payment links even when the related record is absent. Only COMPLETED records have a financial effect.
- **Edge cases:** Old pending refunds; unlinked payments; split tender; missing historical orders; duplicate subtraction through refunded_money; unsupported currency.
- **Acceptance criteria:** Payments never create menu sales. Each refund identity is stored once, and pending completion is discovered independently of recent creation time.
- **Required tests:** Pagination, pending-to-completed transitions, old-resource updated-at filtering, equal-time hash conflicts, and orphan-link repair tests.
- **Definition of done:** Shared definition of done, plus the completed amount-plus-tip versus total cross-check and no unrestricted SDK payload storage.

### T018: Implement bounded initial, incremental and reconciliation sync

- **Task ID:** T018
- **Objective:** Implement bounded initial, incremental and reconciliation sync.
- **Dependencies:** T011, T015, T016, T017.
- **Files or modules:** src/server/square/sync/orchestrator.ts; cursors.ts; app/api/v1/integrations/square/{sync, runs}.
- **Detailed behavior:** Backfill an initial 90 days in daily windows. Run updated-at scans every 15 minutes with 15-minute overlap, nightly reconciliation for seven business days, and weekly reconciliation for 90 days. Freeze each query and cursor window. Advance a stream's completed watermark only after all pages commit. Owner backfills up to 366 days return 202 and run in the worker.
- **Edge cases:** Failure between pages; expired cursors; overlapping manual and scheduled jobs; accidentally ANDing incompatible time filters; backfills outside known local history.
- **Acceptance criteria:** Reimporting unchanged windows preserves source totals. An incomplete paginated run does not advance completed freshness, and long work runs outside web requests.
- **Required tests:** Failure injection and page resume, cursor restart, duplicate scheduling, business-day boundaries, and recovery after an outage exceeding 24 hours.
- **Definition of done:** Shared definition of done, plus scanned, changed, unchanged, and quarantined progress counters.

### T019: Implement signed Square webhook durable inbox

- **Task ID:** T019
- **Objective:** Implement signed Square webhook durable inbox.
- **Dependencies:** T007, T011, T013, T014, T018.
- **Files or modules:** app/api/webhooks/square/route.ts; src/server/square/webhooks; tests/integration/webhooks.
- **Detailed behavior:** Verify raw request bytes with the exact configured URL and signature key using constant-time comparison before trusting JSON. Persist the unique event and durable work atomically, then acknowledge promptly. Refetch canonical resources or catalog changes instead of applying event payloads to balances. Document manual subscription configuration.
- **Edge cases:** Duplicate, out-of-order, or unknown events; wrong merchant; URL query/proxy mismatch; database outage; oversized body.
- **Acceptance criteria:** Forged signatures return 400. A valid duplicate returns 200 with one logical job. Persistence failure returns 503. Sales completeness does not depend on POS order.created events.
- **Required tests:** Golden HMAC and mutated body/URL fixtures, signing-key rotation, concurrent duplicate delivery, inbox rollback, and acknowledgement timing tests.
- **Definition of done:** Shared definition of done, plus webhook secret/log redaction and documented recovery through polling.

### T020: Build integration and canonical-sales screens and Square gate

- **Task ID:** T020
- **Objective:** Build integration and canonical-sales screens and Square gate.
- **Dependencies:** T008, T014, T018, T019.
- **Files or modules:** app/(dashboard)/settings/integrations/square/; app/(dashboard)/reports/catalog/; app/(dashboard)/reports/imported-sales/; app/(dashboard)/reports/sales/[id]/; src/components/domain/sync/.
- **Detailed behavior:** Provide owner configuration, connection-test, and sync screens. Managers can read connection status, runs, catalog, source sales, and exceptions. Show age per stream, projection lag, queue/dead-job state, and stable explanations for unknown errors. Do not add controls for native Square checks or floor plans.
- **Edge cases:** Missing credentials; expired authentication; empty backfill; partial sync; managers with read-only integration access; Square outage.
- **Acceptance criteria:** A fake-backed catalog and repeated 90-day import display identical totals without duplicate UI records.
- **Required tests:** Integration-screen E2E, role visibility, freshness contracts, and source-list pagination tests.
- **Definition of done:** Shared definition of done, plus Phase 2 fake-adapter acceptance evidence. Sandbox and device verification remain explicit later gates.

## Ingredients and recipes (T021-T029)

### T021: Create ingredient, recipe and cost-snapshot schema

- **Task ID:** T021
- **Objective:** Create ingredient, recipe and cost-snapshot schema.
- **Dependencies:** T012, T020.
- **Files or modules:** prisma/migrations/004_ingredients_recipes; prisma/schema.prisma.
- **Detailed behavior:** Implement ingredient/location/package/cost-history, recipe/version/component/mapping, sale-cost snapshot, and desired-consumption tables from DATABASE. Add unit, yield, loss, and recipe-interval constraints. Defer the receipt foreign key to migration 005. Support NO_EFFECT modifiers with a nullable recipe only for that effect.
- **Edge cases:** Cross-scope ingredients; overlapping mappings; zero versus unknown cost; future publication; the temporarily deferred receipt reference.
- **Acceptance criteria:** The migration rejects invalid loss, yield, scope, and overlapping effective intervals. Historical catalog mappings survive tombstones.
- **Required tests:** PostgreSQL constraint tests and the migration 003-to-004 upgrade chain.
- **Definition of done:** Shared definition of done, plus reviewed ingredient_locations locking identity and snapshot schema.

### T022: Implement ingredient, package and supplier CRUD

- **Task ID:** T022
- **Objective:** Implement ingredient, package and supplier CRUD.
- **Dependencies:** T006, T007, T021.
- **Files or modules:** src/server/ingredients; src/server/purchasing/suppliers.ts; ingredient/supplier/package API routes.
- **Detailed behavior:** Implement shared schemas and scoped list, create, versioned update, and archive operations for ingredients, suppliers, and packages. Include supplier contacts, reorder thresholds, and package conversions. Freeze an ingredient's base unit after references exist. Snapshot package conversion into future documents; never infer density. Before T024/T034 are complete, return currentCost:null and balance:null/lowStock:null rather than querying unavailable cost/stock services or inventing zero.
- **Edge cases:** Archived suppliers referenced by active drafts; duplicate normalized names or supplier SKUs; pack-size changes; foreign IDs.
- **Acceptance criteria:** INVENTORY staff can maintain ingredients, suppliers, and packages. HOST and VIEWER cannot access operational supplier contacts.
- **Required tests:** CRUD, optimistic-concurrency, scope, unit-freeze, archival, and SKU uniqueness tests.
- **Definition of done:** Shared definition of done, plus allowlisted DTOs and complete coverage of the specified endpoints.

### T023: Build ingredient, supplier and package pages

- **Task ID:** T023
- **Objective:** Build ingredient, supplier and package pages.
- **Dependencies:** T008, T022.
- **Files or modules:** app/(dashboard)/inventory/ingredients/; app/(dashboard)/inventory/ingredients/[id]/; app/(dashboard)/suppliers/; src/components/domain/ingredient/; src/components/domain/package/.
- **Detailed behavior:** Build searchable responsive ingredient lists/details, supplier contacts, and package editors using the API contracts. Show base units, cost freshness, estimated balance, reorder status, and opening-count requirements. Never invent a cost before a basis exists. Initially render unavailable cost/balance as Unknown/Not available; T024 connects the current-cost read and T034/T037 connect balance displays. Do not add a forward dependency or query tables that have not been migrated.
- **Edge cases:** Empty inventory; zero purchase price; mobile numeric entry; archived references; server field-validation errors.
- **Acceptance criteria:** Staff can define a flour package in kilograms for an ingredient stored in grams without ambiguous conversion. Missing cost displays Unknown.
- **Required tests:** Form and route E2E at mobile widths, plus permission and server-validation display tests.
- **Definition of done:** Shared definition of done, plus loading/error/empty states and keyboard-accessible forms.

### T024: Implement cost-basis and recipe-expansion primitives

- **Task ID:** T024
- **Objective:** Implement cost-basis and recipe-expansion primitives.
- **Dependencies:** T004, T021, T022.
- **Files or modules:** src/server/ingredients/cost-basis.ts; src/server/recipes/expand.ts; cost-basis API.
- **Detailed behavior:** Append ingredient cost-basis rows and select the latest eligible basis at or before the sale time. Support reasoned manual opening costs and receipt-invalidation hooks. Expand ingredient-only recipe batches, apply loss once, normalize modifier direction/quantity, and coalesce demand to six decimal places before exact rate costing. Wire the currentCost field in Ingredient DTO to the eligible basis selector; rate unit is cents per ingredient base unit, with 50 significant working digits and explicit storage-range validation.
- **Edge cases:** Unknown versus zero cost; fractional portions; modifiers causing negative final requirements; equal-time bases; previously selected cost invalidation.
- **Acceptance criteria:** Reference recipe costs and usage match TESTING fixtures. Recording a manual cost basis never changes stock.
- **Required tests:** Unit tests for conversions, yield, loss, rounding, ties, and rejection of inferred density; PostgreSQL tests for timestamped cost selection.
- **Definition of done:** Shared definition of done, plus pure expansion input/output types and a persisted calculation version.

### T025: Implement draft recipe read/write services

- **Task ID:** T025
- **Objective:** Implement draft recipe read/write services.
- **Dependencies:** T007, T021, T024.
- **Files or modules:** src/server/recipes/drafts.ts; recipe/version API routes.
- **Detailed behavior:** Create BASE and MODIFIER recipe roots with one editable draft. Support cloning a published version, atomically replacing validated draft components, and prospective root archival. Apply recipe locks and local versions. Modifier yield is exactly 1; BASE components permit additions only.
- **Edge cases:** Concurrent draft creation; archived referenced ingredients; duplicate ingredient/direction components; incomplete drafts versus publication requirements.
- **Acceptance criteria:** Drafts may be incomplete, while publication has separate validation. Published components cannot be patched.
- **Required tests:** Draft CRUD, cloning, single-draft uniqueness, version-conflict, and tenant-scope tests.
- **Definition of done:** Shared definition of done, plus consistency with the Recipe and RecipeVersion API DTOs.

### T026: Implement immutable publication and variation/modifier mapping

- **Task ID:** T026
- **Objective:** Implement immutable publication and variation/modifier mapping.
- **Dependencies:** T007, T015, T024, T025.
- **Files or modules:** src/server/recipes/publish.ts; mappings.ts; publication/mapping API.
- **Detailed behavior:** Publish at the transaction's current time or a supplied future instant. Close the preceding effective interval under lock and prevent overlaps. Map exact variation/modifier IDs through prospective intervals. Explicit modifier NO_EFFECT mappings require a reason. End mappings prospectively, and enqueue applicable bounded projections.
- **Edge cases:** Concurrent publication; deleted source variations; attempted backdating; unknown selected modifiers; combinations producing negative ingredient requirements.
- **Acceptance criteria:** Published history is immutable. Each instant has at most one effective mapping/version, and matching never uses display names.
- **Required tests:** Effective-interval boundaries, concurrent publication, NO_EFFECT modifiers, invalid mapping kinds, backdate rejection, and prospective projection-job tests.
- **Definition of done:** Shared definition of done, plus historical replay reserved for the owner-only workflow in T057.

### T027: Build recipe builder and catalog mapping pages

- **Task ID:** T027
- **Objective:** Build recipe builder and catalog mapping pages.
- **Dependencies:** T008, T023, T025, T026.
- **Files or modules:** app/(dashboard)/recipes/; app/(dashboard)/recipes/[id]/; app/(dashboard)/recipes/mappings/; src/components/domain/recipe-editor/.
- **Detailed behavior:** Build a batch-ingredient editor with yield/loss inputs, modifier deltas, cost previews, and publication confirmation. The variation picker uses source IDs with readable names. Show unknown costs/modifiers, version history, effective times, and mapping coverage.
- **Edge cases:** Deleted unused variations; negative final ingredient requirements; free versus unknown ingredients; concurrent saves; component rows on mobile.
- **Acceptance criteria:** A manager can build and publish the reference recipe and map the correct variation. INVENTORY staff cannot publish recipes.
- **Required tests:** Recipe-authoring E2E, unknown-cost and publication-error cases, and keyboard component-reordering checks.
- **Definition of done:** Shared definition of done, plus API scalar-string inputs without floating-point conversion.

### T028: Implement immutable sale-cost projection engine

- **Task ID:** T028
- **Objective:** Implement immutable sale-cost projection engine.
- **Dependencies:** T016, T017, T024, T026.
- **Files or modules:** src/server/recipes/sale-cost.ts; snapshot repository; projection job handler.
- **Detailed behavior:** For the canonical order's own sale lines, select recipe, mapping, and cost basis effective at sale close. Store ingredient/modifier version IDs, cost-basis IDs, exact quantities, known/partial/unknown state, and input hash. Identical replay is a no-op; a changed revision supersedes the prior snapshot without editing it. This is the first cost-only implementation of the single REBUILD_SALE_PROJECTION handler. T036 extends the same handler/transaction with quantity state and stock posting, rather than registering a competing handler or skipping quantities because a cost snapshot already exists.
- **Edge cases:** Unmapped historical lines; pending source revisions; NO_EFFECT modifiers; return-only orders; close-time correction requiring review.
- **Acceptance criteria:** Historical sale costs survive later receipts or recipe versions. An explicit zero cost is known, and missing cost remains unknown.
- **Required tests:** Historical effective selection, version replay, per-line rounding, return/exchange handling, and races with superseding source revisions.
- **Definition of done:** Shared definition of done, plus an atomic source-revision check before committing the snapshot.

### T029: Deliver recipe-cost and mapping-exception acceptance gate

- **Task ID:** T029
- **Objective:** Deliver recipe-cost and mapping-exception acceptance gate.
- **Dependencies:** T020, T027, T028.
- **Files or modules:** app/(dashboard)/recipes/costs/; app/(dashboard)/recipes/mappings/; tests/e2e/recipe-cost/.
- **Detailed behavior:** Add current theoretical cost per dish, historical cost-snapshot detail, and queues for unmapped variations or unknown modifiers. Distinguish today's preview from historical sale cost. Connect changed canonical sales to cost-projection jobs before inventory consumption is implemented.
- **Edge cases:** Purchase-price changes; partial mappings; all-zero revenue; recipe versions starting after historical sales.
- **Acceptance criteria:** The golden recipe shows its expected cost. New prices do not change old snapshots, and unmapped items display Unknown.
- **Required tests:** Golden recipe UI/service journey, price-change preservation, and cost-coverage tests.
- **Definition of done:** Shared definition of done, plus Phase 3 acceptance evidence and no inventory side effects yet.

## Purchasing and inventory (T030-T039)

### T030: Create purchasing and stock-ledger schema

- **Task ID:** T030
- **Objective:** Create purchasing and stock-ledger schema.
- **Dependencies:** T021, T029.
- **Files or modules:** prisma/migrations/005_purchasing_stock; prisma/schema.prisma.
- **Detailed behavior:** Add purchase orders and receipts with lines, stock movements, physical counts and lines, immutable source keys, and cost-eligibility events. Complete the receipt foreign key deferred from migration 004. Enforce sign, nonzero, type, and scope constraints, with per-ingredient location locking identity. Do not introduce an independently authoritative mutable balance.
- **Edge cases:** Zero-variance counts; late movements effective before a count; receipt-reversal uniqueness; partially received purchase orders.
- **Acceptance criteria:** SQL rejects duplicate posting keys and invalid movement signs. All prior migrations still apply unchanged.
- **Required tests:** Migration constraint tests, count-anchor query fixtures, and source-posting key uniqueness tests.
- **Definition of done:** Shared definition of done, plus documented ledger/count SQL and read indexes.

### T031: Implement purchase-order lifecycle and amendments

- **Task ID:** T031
- **Objective:** Implement purchase-order lifecycle and amendments.
- **Dependencies:** T007, T022, T030.
- **Files or modules:** src/server/purchasing/purchase-orders.ts; purchase-order API routes.
- **Detailed behavior:** Implement draft creation/editing, ORDER, CANCEL, CLOSE_SHORT, and ordered-quantity amendments requiring reasons. Receipt posting derives PARTIALLY_RECEIVED and RECEIVED statuses. Snapshot package conversions/prices, lock the header during receiving and amendments, and assign a unique purchase-order number.
- **Edge cases:** Cancellation after partial receiving; closing short; reducing below received quantity; concurrent amendment and receiving; archived suppliers.
- **Acceptance criteria:** Staff can place orders and explicitly amend quantities. No automatic supplier ordering or email is sent. Invalid transitions return 409.
- **Required tests:** State-transition matrix, scope, optimistic conflicts, concurrent amendment/receiving, and package-snapshot tests.
- **Definition of done:** Shared definition of done, plus received quantities and receipt-driven status derived from posted nonreversed receipts.

### T032: Implement draft receipt and atomic goods receiving

- **Task ID:** T032
- **Objective:** Implement draft receipt and atomic goods receiving.
- **Dependencies:** T007, T024, T030, T031.
- **Files or modules:** src/server/purchasing/receipts.ts; receipt API; inventory/posting.ts.
- **Detailed behavior:** Create and edit draft receipts, then post each receipt exactly once. Acquire the server posting time after locking ingredients in sorted order. Validate supplier, purchase-order lines, and outstanding quantities. In one transaction append stock movements, cost bases, audit, and purchase-order state changes. Allow ad hoc receipts without a purchase order.
- **Edge cases:** Posting again under a different request key; partial delivery; overreceipt; zero-cost ingredients; a posting timestamp equal to the latest count; failure during posting.
- **Acceptance criteria:** Stock increases only by actual delivered quantity. Purchase-order status is accurate, posted receipt edits are rejected, and the recorded cost rate is reproducible.
- **Required tests:** Concurrent posting, transaction rollback, overreceipt, partial and ad hoc receipts, and clock/count-anchor ordering tests.
- **Definition of done:** Shared definition of done, plus immutable receipt/package snapshots and one cost basis per receipt line.

### T033: Implement linked receipt reversal and replacement workflow

- **Task ID:** T033
- **Objective:** Implement linked receipt reversal and replacement workflow.
- **Dependencies:** T007, T032.
- **Files or modules:** src/server/purchasing/receipt-reversals.ts; reverse API; cost eligibility handler.
- **Detailed behavior:** Append an exact opposite stock movement at the current posting time, a unique reversal reference, an audited reason, and the purchase-order received-quantity correction. Preserve the original receipt and history. Change cost eligibility prospectively while retaining historical cost snapshots. A replacement is a separate new editable receipt.
- **Edge cases:** A reversal retried with a new key; physical counts since the original receipt; later receipt costs; negative resulting stock; purchase orders closed short.
- **Acceptance criteria:** Past stock is not silently edited. Historical report costs stay unchanged unless the owner explicitly replays them. Corrected purchase orders can receive outstanding goods again.
- **Required tests:** Duplicate reversal, reversal after a count, cost eligibility and next-basis selection, rollback, and negative-stock warning tests.
- **Definition of done:** Shared definition of done, plus linked original/reversal references and safe correction instructions in the DTO.

### T034: Implement waste, manual corrections and balance queries

- **Task ID:** T034
- **Objective:** Implement waste, manual corrections and balance queries.
- **Dependencies:** T007, T030, T032.
- **Files or modules:** src/server/inventory/posting.ts; balances.ts; waste/adjustment/movement API.
- **Detailed behavior:** Use one inventory posting service to validate scoped ingredients, lock ingredient_locations, assign an operational effective time after the current count, and append immutable signed movements with required reasons. OWNER, MANAGER, and INVENTORY may post corrections. Waste reason codes are SPOILAGE, PREP_ERROR, DAMAGE, and OTHER. Calculate balance from the latest posted count anchor plus later non-count movements. Wire Ingredient.balance and lowStock DTO values to the real balance service. Use clock_timestamp after acquiring the ingredient lock and a minimum of latest-count cutoff plus one microsecond for operational movements.
- **Edge cases:** Negative estimates; unknown waste cost; equal timestamps; late sales effective before a count; arbitrary source IDs; zero adjustments.
- **Acceptance criteria:** There is no direct balance-edit operation. Balances always identify their estimated nature. Returned ingredients are restored only through an explicit correction, and HOST cannot mutate stock.
- **Required tests:** Movement signs, zero rejection, balance formula, role matrix, reason redaction, and operational-clock ordering tests.
- **Definition of done:** Shared definition of done, plus indexed balance/movement queries and a missing-opening-count flag.

### T035: Implement physical-count drafts and atomic anchor posting

- **Task ID:** T035
- **Objective:** Implement physical-count drafts and atomic anchor posting.
- **Dependencies:** T007, T030, T034.
- **Files or modules:** src/server/inventory/stock-counts.ts; stock-count API.
- **Detailed behavior:** Allow draft actual quantities. At posting, lock affected ingredient-location rows in UUID order, obtain PostgreSQL clock_timestamp after acquiring locks, compute expected balance and variance, and store the immutable new anchor. Append a COUNT_ADJUSTMENT trace only for nonzero variance, excluding count movements from the anchored balance sum. Reject client-supplied historical count times.
- **Edge cases:** Zero variance still establishes a new anchor; repeated finalization; concurrent sale/receipt posting; late sales; correcting a count through a new count; deadlocks across multiple ingredients.
- **Acceptance criteria:** A count sets physical balance exactly. Later-effective sales deduct stock; late pre-count sales do not. Prior anchors remain auditable.
- **Required tests:** Barrier concurrency, zero variance, backdate rejection, repeated posting, lock waits and cutoff equality, negative expected balance, and rollback tests.
- **Definition of done:** Shared definition of done, plus physical-operations-pause acknowledgement and expected/actual/variance DTOs.

### T036: Connect canonical sales to idempotent consumption projection

- **Task ID:** T036
- **Objective:** Connect canonical sales to idempotent consumption projection.
- **Dependencies:** T018, T028, T030, T034, T035.
- **Files or modules:** src/server/inventory/sale-projection.ts; REBUILD_SALE_PROJECTION handler; sale state repository.
- **Detailed behavior:** Acquire connection/order locks followed by ordered ingredient locks. Validate the canonical source revision, expand desired rounded usage, compare stored line/ingredient totals, and append only differences. Commit cost snapshot, desired state, movements, and audit together. Source cancellation or reduced quantity reverses prior usage; a financial refund alone preserves it. Removed ingredients reverse their prior desired quantities. Whole-line unknown quantity mapping preserves prior applied desired quantities; it never guesses base-only modifier usage. Missing ingredient cost alone still permits known quantity posting. Scan all canonical lines with pending quantity projection, including cost-only snapshots created before this task.
- **Edge cases:** Repeated events/imports/replays; worker failure; recipe changes; unknown parts of a recipe; first-close changes requiring review; corrections effective before a count.
- **Acceptance criteria:** Importing the same finalized sale 100 times produces one net deduction. Changing quantity from 2 to 1 leaves one unit's consumption. A refund does not restock ingredients.
- **Required tests:** Concurrent replay, changed lines/modifiers, removed ingredients, cancellation, refunds, unknown mappings, crash/fencing, and count-anchor tests.
- **Definition of done:** Shared definition of done, plus startup recovery for unprojected canonical revisions. Zero differences do not create zero-quantity movements.

### T037: Build inventory, waste, count and ledger screens

- **Task ID:** T037
- **Objective:** Build inventory, waste, count and ledger screens.
- **Dependencies:** T008, T023, T034, T035, T036.
- **Files or modules:** app/(dashboard)/inventory/; app/(dashboard)/inventory/waste/; app/(dashboard)/inventory/adjustments/; app/(dashboard)/inventory/stock-counts/; app/(dashboard)/inventory/movements/; src/components/domain/inventory/.
- **Detailed behavior:** Build mobile balance/low-stock views, reasoned waste and correction forms, physical-count drafts with final variance review, and filtered ledger views. Show effective and posted times, count-covered movements, the latest anchor, and source links. Numeric controls must work without hover.
- **Edge cases:** Negative stock; missing opening counts; changes while a count is being edited; unknown cost; historical movements arriving after a later count.
- **Acceptance criteria:** Inventory staff can receive goods, record waste, and post counts with auditable history. Balance labels explain that stock is estimated between counts.
- **Required tests:** Mobile workflow E2E, count-conflict handling, permission and calculation-label checks, and keyboard numeric entry.
- **Definition of done:** Shared definition of done, plus no edit controls for posted history and clear navigation to reversal workflows.

### T038: Build purchase-order and receiving screens

- **Task ID:** T038
- **Objective:** Build purchase-order and receiving screens.
- **Dependencies:** T008, T023, T031, T032, T033.
- **Files or modules:** app/(dashboard)/purchasing/; app/(dashboard)/purchasing/[id]/; app/(dashboard)/purchasing/receive/; app/(dashboard)/purchasing/receipts/[id]/; src/components/domain/receiving/.
- **Detailed behavior:** Build draft purchase-order editing, ordering, amendment, and short-close controls; partial receiving against outstanding base quantity; ad hoc receipts; draft receipt editing; posting confirmation; and reasoned reversal. Clearly display package conversions and the actual ingredient-only cost basis.
- **Edge cases:** Repeated supplier-document reference warnings; overdelivery requiring an amendment; concurrent posting; reversed receipts; zero purchase cost.
- **Acceptance criteria:** A partial delivery adds only its actual quantity. Repeated submission displays the original posted receipt, and historical receipts cannot be edited.
- **Required tests:** Purchase order to partial receipt to reversal to replacement E2E, plus mobile forms and error states.
- **Definition of done:** Shared definition of done, plus purchase-order/receipt transitions and links matching the API.

### T039: Run ingredient-cost and inventory end-to-end acceptance gate

- **Task ID:** T039
- **Objective:** Run ingredient-cost and inventory end-to-end acceptance gate.
- **Dependencies:** T029, T036, T037, T038.
- **Files or modules:** tests/e2e/inventory-cost; tests/fixtures/acceptance; docs/ACCEPTANCE_EVIDENCE.md.
- **Detailed behavior:** Exercise the reference menu recipe, opening count and cost, supplier purchase order, partial receipt, waste, physical count, late fake Square sale, corrected sale, and refund. Record expected cost coverage and net quantities. Replay each posting request to verify idempotency.
- **Edge cases:** Unmapped variations; missing purchase prices; refunds without recoverable ingredients; late sales effective before a count; source quantity corrections.
- **Acceptance criteria:** All source-plan Phase 3/4 criteria pass with deterministic fixtures and no duplicate movements. Historical costs remain reproducible.
- **Required tests:** The full acceptance sequence, SQL ledger-invariant checks, and audit-attribution assertions.
- **Definition of done:** Shared definition of done, plus actual commands and results recorded as evidence without claiming production verification.

## Reservations and waitlist (T040-T049)

### T040: Create reservation and waitlist schema with database exclusion

- **Task ID:** T040
- **Objective:** Create reservation and waitlist schema with database exclusion.
- **Dependencies:** T007, T039.
- **Files or modules:** prisma/migrations/006_reservations; prisma/schema.prisma.
- **Detailed behavior:** Implement physical tables, combinations, settings, hours, blocks, reservations, allocations, and waitlist records with composite scope foreign keys and a per-location settings lock row. Use btree_gist exclusion over active buffered tstzrange intervals. Store one allocation per physical table and a permanent public request-key hash. Add seated_active per physical allocation, CHECK seated_active implies active, and a partial unique (restaurant_id,location_id,table_id) where seated_active.
- **Edge cases:** Combinations sharing physical members; adjacent half-open intervals; foreign-tenant tables; allocations for terminal reservations; unavailable extensions.
- **Acceptance criteria:** Direct SQL cannot create two overlapping active claims on one physical table. Inactive historical allocations do not block future availability.
- **Required tests:** Real PostgreSQL exclusion, combination, scope, and migration tests; inspect pg_constraint to confirm the safety constraint exists.
- **Definition of done:** Shared definition of done, plus the managed PostgreSQL extension requirement recorded in deployment documentation.

### T041: Implement table and booking-configuration services

- **Task ID:** T041
- **Objective:** Implement table and booking-configuration services.
- **Dependencies:** T006, T007, T040.
- **Files or modules:** src/server/reservations/settings.ts; tables.ts; table/combination/settings API.
- **Detailed behavior:** Implement versioned creation/activation of tables, explicit combinations whose capacity does not exceed member capacity, and opening hours, closures, and defaults from ARCHITECTURE. All changes lock booking_settings. Reject changes invalidating active reservations, and keep public booking unpublished until settings are complete and valid.
- **Edge cases:** Overnight service; duplicate/overlapping hours; DST transitions; inactive combination members; reduced capacity; future bookings spanning settings changes.
- **Acceptance criteria:** A manager can configure the dining room without Square synchronization. HOST access is read-only. Invalidating changes return 409 with accessible affected reservation IDs.
- **Required tests:** Configuration validation, races between settings changes and booking, closures, DST, and scope tests.
- **Definition of done:** Shared definition of done, plus defaults defined once: 30-minute notice, 90-day horizon, 90-minute dining duration, and 15-minute cleanup.

### T042: Implement shared concurrency-safe reservation allocator

- **Task ID:** T042
- **Objective:** Implement shared concurrency-safe reservation allocator.
- **Dependencies:** T004, T040, T041.
- **Files or modules:** src/server/reservations/allocator.ts; candidates.ts; tests/integration/booking-concurrency.
- **Detailed behavior:** Use a pure candidate evaluator for hours, blocks, capacity, and buffers. Within a database transaction lock settings, revalidate, choose least excess capacity, then fewest tables, then stable ID, and claim all physical tables atomically. Explicit staff selection must match one table or an exact approved combination. Map exclusion failures to 409 and apply bounded retries. Concurrency fixture: ten independent single tables, no combinations, one party fitting one table, twenty simultaneous identical windows; exactly ten commits and ten SLOT_UNAVAILABLE responses. Other combination fixtures assert safety, not globally optimal greedy packing. Reject new allocations for tables with an overdue SEATED reservation until staff resolves it. Actual seating also checks the independent unique seated claim, so nonoverlapping scheduled windows cannot produce two seated parties on one physical table.
- **Edge cases:** Concurrent requests for the same slot; a combination competing with a member table; touching buffer boundaries; settings races; sufficient capacity on occupied tables; transaction rollback.
- **Acceptance criteria:** With 20 simultaneous requests for one slot, the number of successful bookings equals the number of disjoint available table configurations defined by the fixture. No overlapping physical allocation commits.
- **Required tests:** Real PostgreSQL concurrency tests with barriers, single and combined tables, rollback, deadlock retry, and half-open intervals.
- **Definition of done:** Shared definition of done, plus public booking, staff booking, and waitlist seating all using this sole allocator.

### T043: Implement public availability projection

- **Task ID:** T043
- **Objective:** Implement public availability projection.
- **Dependencies:** T004, T041, T042.
- **Files or modules:** src/server/reservations/availability.ts; app/api/public/[restaurantSlug]/restaurant; availability.
- **Detailed behavior:** Publish minimal restaurant configuration and UTC slot choices for a date/party, with local labels and UTC offsets. Use the allocator's candidate evaluator, 15-minute steps, lead-time and advance limits, default duration, and full buffered intervals within service hours unless cleanup after closing is explicitly permitted. Availability creates no hold and exposes no PII or table IDs.
- **Edge cases:** Nonexistent/repeated DST times; closed dates; unpublished slugs; no availability; past dates; host timezone differing from the restaurant.
- **Acceptance criteria:** Public users see only bookable slots and published restaurant facts. Availability is clearly advisory, and repeated local times have unambiguous offsets.
- **Required tests:** DST/service-window fixtures, public response privacy contracts, bounded/rate-limited requests, and settings-change tests.
- **Definition of done:** Shared definition of done, plus no-store responses and bounded availability-query complexity.

### T044: Implement public booking creation and abuse controls

- **Task ID:** T044
- **Objective:** Implement public booking creation and abuse controls.
- **Dependencies:** T007, T042, T043.
- **Files or modules:** src/server/reservations/public-create.ts; public reservation API; rate-limit integration.
- **Detailed behavior:** Validate publication, current terms, privacy acknowledgement, contact, party size, slot, and honeypot. Allocate atomically with a permanent domain request key. Persist the normal reservation immediately without waiting for email. Return a confirmation without guest PII, and optionally enqueue notification work after commit. The settings-version race test changes server settings between availability and create, then proves revalidation under the allocator lock; public create does not require an undeclared settingsVersion field. Same-key public replay returns 200 current non-PII status, even after cancellation or contact redaction, while staff mutations preserve exact original responses.
- **Edge cases:** Double clicks; replay after response-cache expiry; a changed body with the same key; a newly occupied slot; rate-limit key rotation; forged proxy IP; mail failure.
- **Acceptance criteria:** Concurrent users cannot double book. Exact replay returns the caller's existing reference. A nonempty honeypot never receives fake success, and a 429 response creates no booking.
- **Required tests:** Public concurrency, persistent spam buckets, body hashes, request-key expiry, response privacy, settings-version changes, and 503 rollback tests.
- **Definition of done:** Shared definition of done, plus recorded published privacy/terms version and optional marketing consent defaulting to false.

### T045: Implement staff reservations, walk-ins and transitions

- **Task ID:** T045
- **Objective:** Implement staff reservations, walk-ins and transitions.
- **Dependencies:** T006, T007, T042, T044.
- **Files or modules:** src/server/reservations/staff.ts; reservation API routes.
- **Detailed behavior:** Create confirmed staff bookings, atomically reallocate edits, and implement SEAT, COMPLETE, CANCEL, and NO_SHOW transitions. Walk-ins are seated at the current time. Contact is optional only for a present walk-in/waitlist guest; hours and capacity rules still apply. Extend an overrun transactionally or require reassignment when it conflicts. SEAT preserves scheduled startsAt, records server seatedAt, expands occupancy back to min(startsAt, seatedAt), and extends end to max(existing end, seatedAt+duration). If extension conflicts, leave all state unchanged. COMPLETE means the table is cleared and ready, so releasing cleanup capacity is intentional. An uncleared prior SEATED party blocks seating regardless of finite planned time. Return TABLE_OCCUPIED and preserve current state; overdue table availability remains conservative until resolved.
- **Edge cases:** Failed edits retaining original claims; late arrival; a no-show before start; repeated completion; seating that conflicts with the next booking; foreign tables.
- **Acceptance criteria:** Cancellation releases every active claim. Commands follow the API state machine, and staff cannot bypass occupancy constraints.
- **Required tests:** State-transition matrix, reallocation rollback, overrun/conflict, contact-optional walk-ins, and role/scope tests.
- **Definition of done:** Shared definition of done, plus redacted before/after audit records. Terminal states cannot be reopened.

### T046: Implement waitlist lifecycle and atomic seating

- **Task ID:** T046
- **Objective:** Implement waitlist lifecycle and atomic seating.
- **Dependencies:** T007, T042, T045.
- **Files or modules:** src/server/reservations/waitlist.ts; waitlist API routes.
- **Detailed behavior:** Add present guests and record estimated wait, manual notification, and removal. NOTIFY records a staff action without sending SMS. Seating creates a STAFF/WAITLIST reservation at the current time, claims tables, and marks the waitlist entry SEATED in one transaction. Use the shared allocator rather than independent occupancy flags. PATCH waitlist actions are explicitly NOTIFY, CANCEL, or LEAVE (WAITING/NOTIFIED to the corresponding terminal state), matching API and UI; do not implement an ambiguous REMOVE action.
- **Edge cases:** Repeated seating; two hosts acting concurrently; walkouts; unavailable tables; absent contact details; overlap with future bookings.
- **Acceptance criteria:** One waitlist entry cannot create two seated reservations. Failed seating leaves it WAITING, and notification records do not send a message.
- **Required tests:** Concurrent seating, idempotency, rollback, state transitions, overlap, and permission tests.
- **Definition of done:** Shared definition of done, plus retained reservation linkage and audit history.

### T047: Build host day view, reservation details and waitlist UI

- **Task ID:** T047
- **Objective:** Build host day view, reservation details and waitlist UI.
- **Dependencies:** T008, T043, T045, T046.
- **Files or modules:** app/(dashboard)/reservations/; app/(dashboard)/reservations/[id]/; app/(dashboard)/reservations/waitlist/; src/components/domain/host/.
- **Detailed behavior:** Build a desktop day/table timeline and a mobile list, with clear status, time, party, and table claims. Provide staff create/edit/seat/complete/cancel/no-show, walk-in, and waitlist controls. Preserve form input after conflicts while refreshing availability. Warn on overruns and support reassignment.
- **Edge cases:** DST service days; empty service; parties seated beyond their expected end; concurrent hosts; phone keyboards; permissions revoked mid-session.
- **Acceptance criteria:** Hosts can manage service through RestaurantOS independently of Square. Only authorized staff see guest PII, and no native POS-check controls appear.
- **Required tests:** Host journey E2E, keyboard and touch controls, conflict/rollback UI, role access, and DST labels.
- **Definition of done:** Shared definition of done. Omit export controls until T054 provides the authorized export workflow; no broken or insecure placeholder download is present.

### T048: Build table, combination and booking-settings UI

- **Task ID:** T048
- **Objective:** Build table, combination and booking-settings UI.
- **Dependencies:** T008, T041, T047.
- **Files or modules:** app/(dashboard)/tables/; app/(dashboard)/settings/booking/; src/components/domain/opening-hours/.
- **Detailed behavior:** Allow managers to edit table labels/capacity, combination members, opening hours, blocked periods, booking defaults, and publication. Explain the impact before changes. A server 409 identifies affected accessible reservations and links to their resolution. HOST sees a read-only configuration view.
- **Edge cases:** A closure intersecting a booking; deactivating a combination member; invalid capacity; overnight service hours; unsaved changes.
- **Acceptance criteria:** Managers can prepare valid service configuration and publish booking availability without invalidating existing allocations.
- **Required tests:** Settings UI E2E, validation and affected-booking conflict handling, read-only HOST access, and mobile layouts.
- **Definition of done:** Shared definition of done, plus no claims of Square table mapping.

### T049: Build public booking flow and reservation acceptance gate

- **Task ID:** T049
- **Objective:** Build public booking flow and reservation acceptance gate.
- **Dependencies:** T008, T043, T044, T047, T048.
- **Files or modules:** app/(public)/book/[restaurantSlug]; publicbookingcomponents; tests/e2e/public-booking.
- **Detailed behavior:** Build the date/party, slot, contact/terms, and confirmation steps with server validation and one persistent request key per booking attempt. Show the restaurant timezone, contact instructions, and opaque confirmation reference. A lost slot returns 409 and sends users back to availability without losing contact input. Guests contact the host for later changes or cancellation.
- **Edge cases:** Mobile layout at 390px; invalid slugs; closed service; repeated DST slots; double clicks; network timeout after commit; disabled email.
- **Acceptance criteria:** A guest can confirm one valid reservation. A competing guest receives a conflict. A screen-reader user can complete the flow, and no other guest details or internal table IDs are exposed.
- **Required tests:** Public booking to host seating/cancellation E2E, timeout retry, DOM/network privacy checks, and a 20-client booking race.
- **Definition of done:** Shared definition of done, plus Phase 5 acceptance evidence and no dependency on successful email delivery.

## Reporting and controlled corrections (T050-T059)

### T050: Add reporting, replay and export persistence

- **Task ID:** T050
- **Objective:** Add reporting, replay and export persistence.
- **Dependencies:** T030, T040.
- **Files or modules:** prisma/migrations/007_reporting_hardening; prisma/schema.prisma; operations repositories.
- **Detailed behavior:** Create replay preview/results, bounded private export blobs and remaining dependent FKs from DATABASE; harden refund allocation indexes/constraints already introduced with Square schema 003. Add eligibility/current-revision indexes and nonnegative allocation checks; enforce DATABASE runtime-role grants and immutable posted-history triggers; sum validation uses a locked service transaction.
- **Edge cases:** Refund allocation revisions; expired preview; orphan source order; blob over 10MiB; records from disabled users.
- **Acceptance criteria:** All seven migrations apply fresh and upgrade fixtures; historical allocations/results cannot be overwritten.
- **Required tests:** Migration chain, cross-scope FK, uniqueness, blob/expiry and refund allocation constraint tests.
- **Definition of done:** Shared DoD plus migration map and query indexes synchronized with DATABASE.

### T051: Implement refund allocation and menu-sales reporting

- **Task ID:** T051
- **Objective:** Implement refund allocation and menu-sales reporting.
- **Dependencies:** T007, T017, T036, T050.
- **Files or modules:** src/server/reporting/refund-allocations.ts; sales.ts; refund and sales report API.
- **Detailed behavior:** Use own completed sale lines gross minus allocated source line discounts, excluding tax/tips/services/non-menu loads. Recognize each completed refund once at source created date; auto split only under verified unambiguous evidence, otherwise manager allocation sums exactly to refund amount. Net menu sales null while unresolved.
- **Edge cases:** Itemized/custom return order; exchange; split tenders; tips/tax refunded; refund of older unseen sale; payment.refunded_money duplicate.
- **Acceptance criteria:** Golden source totals reconcile to normalized fixtures; pending/failed refund has no recognized effect; unresolved split clearly provisional.
- **Required tests:** Golden line discount/return/refund fixtures, allocation revision/concurrency, cents sum, unknown category and negative revenue tests.
- **Definition of done:** Shared DoD plus separate sales/collections/returns quantities and documented period convention.

### T052: Implement historical food-cost and contribution reports

- **Task ID:** T052
- **Objective:** Implement historical food-cost and contribution reports.
- **Dependencies:** T028, T036, T051.
- **Files or modules:** src/server/reporting/food-cost.ts; food-cost API; report DTOs.
- **Detailed behavior:** Read latest accepted immutable snapshots for date range, aggregate prepared consumption cost and matched revenue coverage. Overall cost/margin/food-cost percent only complete when inputs complete; partial known subset has its own denominator. Never remove prepared-food cost for a money-only refund.
- **Edge cases:** Unknown cost vs known zero; free comp; revenue <=0; selected modifier unknown; source projection lag; refund without line attribution.
- **Acceptance criteria:** Report matches fixture costs exactly; partial mappings never masquerade as low food cost; contribution excludes overhead.
- **Required tests:** Full/partial/zero/negative denominators, multi-line rounding, historical price changes and freshness contract tests.
- **Definition of done:** Shared DoD plus all nullable values have explicit quality reasons.

### T053: Implement purchasing, waste and inventory summary reports

- **Task ID:** T053
- **Objective:** Implement purchasing, waste and inventory summary reports.
- **Dependencies:** T024, T033, T034, T035, T050.
- **Files or modules:** src/server/reporting/purchasing.ts; inventory.ts; purchasing/inventory report API.
- **Detailed behavior:** Aggregate immutable original receipt and linked reversal events by supplier and their own posting dates, waste quantity and pinned posting-time cost, count variances and current low-stock separately. Reversal spend recognized as its own period correction, retaining gross/reversal/net fields rather than rewriting past-period facts.
- **Edge cases:** Reversal after prior period; unknown waste basis; mixed ingredient units; negative estimate; archived supplier.
- **Acceptance criteria:** Report numbers reconcile to immutable receipt/ledger facts; quantities are grouped by ingredient/base unit, not summed across dimensions.
- **Required tests:** Supplier totals, cross-period reversal, waste unknown cost, count variance and role access tests.
- **Definition of done:** Shared DoD plus date bases and reversal accounting match DATABASE/API.

### T054: Implement private asynchronous CSV and host exports

- **Task ID:** T054
- **Objective:** Implement private asynchronous CSV and host exports.
- **Dependencies:** T007, T011, T045, T050, T051, T052, T053.
- **Files or modules:** src/server/operations/exports.ts; export job; exports API; report/host export controls.
- **Detailed behavior:** Enqueue scoped export with per-kind role policy; bounded DB blob <=10MiB/50k rows; authenticated same-user download and audit, CSV formula escaping and RFC4180. Host sheet one service date, only necessary PII; expires1h vs24h other files and requires fresh login.
- **Edge cases:** Foreign export ID; user demoted after creation; expired file; injection-leading text; oversized range; failed job.
- **Acceptance criteria:** Authorized user receives correct scoped CSV; anonymous/other user cannot download; expired PII blob is deleted.
- **Required tests:** CSV injection/quotes/newlines, RBAC/IDOR, expiry, boundary size, regenerated retry and guest redaction tests.
- **Definition of done:** Shared DoD plus no public storage URLs and controls omitted until export service exists.

### T055: Build executive dashboard and report screens

- **Task ID:** T055
- **Objective:** Build executive dashboard and report screens.
- **Dependencies:** T008, T020, T037, T051, T052, T053, T054.
- **Files or modules:** app/(dashboard)/dashboard; reports/sales; food-cost; purchasing; reconciliation summaries.
- **Detailed behavior:** Date/business-day filters, net/gross menu sales, matched cost/margin, trends, top variations, supplier spend, quality coverage and source/projection timestamps. Unknown metrics are labeled, stale data visible. Viewer aggregate access; inventory report remains operational role scoped.
- **Edge cases:** All-zero demo day; no connection; partial cost/refund mapping; long date range; mobile chart; report API failure.
- **Acceptance criteria:** Owner can trace dashboard number to source report; no invented comparisons, fake live status or accounting net-profit claim.
- **Required tests:** Golden fixture dashboard E2E, filter timezone, partial/stale rendering, viewer DTO privacy and chart accessible data table.
- **Definition of done:** Shared DoD plus UI_DESIGN page specifications implemented with real values.

### T056: Implement reconciliation engine and issue workflow

- **Task ID:** T056
- **Objective:** Implement reconciliation engine and issue workflow.
- **Dependencies:** T018, T036, T051, T055.
- **Files or modules:** src/server/square/reconciliation.ts; reconciliation API; app/(dashboard)/reports/reconciliation.
- **Detailed behavior:** Compare imported source totals and linked completed payments/refunds using Square equations, inspect orphan records, missing projections and duplicate net movements. Upsert stable issue fingerprints, allow manager acknowledgment/recheck; engine resolves only from evidence, not edited balancing entries.
- **Edge cases:** Split/cash/custom tender; old refund/source outside backfill; rounding/service fee; recurring mismatch after acknowledgment.
- **Acceptance criteria:** Mismatch remains visible until source/evidence reconciles; recheck does not change Square or manufacture sales.
- **Required tests:** Every reconciliation classification fixture, repeated issue dedupe/reopen, orphan refetch and ledger invariant tests.
- **Definition of done:** Shared DoD plus nightly/weekly jobs and health status use unresolved issue severity.

### T057: Implement previewed owner historical correction/replay

- **Task ID:** T057
- **Objective:** Implement previewed owner historical correction/replay.
- **Dependencies:** T007, T028, T036, T050, T056.
- **Files or modules:** src/server/operations/projection-replays.ts; preview/execute API; worker replay handler.
- **Detailed behavior:** Preview bounded <=366-day remap/recost or source timestamp repair with input fingerprint and expiry; show old/new snapshot, cost, current stock and count-covered deltas. Fresh owner executes unchanged preview. Preserve snapshots and source posting identity; timestamp moves reverse old effective date and replace new date.
- **Edge cases:** Inputs changed after preview; retry/crash; equal amount across count anchor; unknown mappings; replay before opening count.
- **Acceptance criteria:** Expired/stale preview cannot execute; repeat execution produces identical net ledger; timestamp repair cannot disappear as zero net delta.
- **Required tests:** Preview race, execution idempotency/fencing, historical cost change, old/new count-anchor time, permission and audit tests.
- **Definition of done:** Shared DoD plus new snapshots reference replay and original; no delete/reinsert dedupe workaround.

### T058: Build recovery and health operator UI/commands

- **Task ID:** T058
- **Objective:** Build recovery and health operator UI/commands.
- **Dependencies:** T011, T014, T018, T054, T056, T057.
- **Files or modules:** app/(dashboard)/settings/operations; operations API; scripts/recover-sync.ts; README/runbooks.
- **Detailed behavior:** Owner sees worker heartbeat, stream/projection lag, dead jobs, replay preview and integration pause/retest/resume guidance. Support safe token rotation retaining IDs, bounded retry/replay and maintenance toggles. Diagnostic exports contain sanitized metadata only.
- **Edge cases:** Revoked token; unavailable DB; duplicate retry; active maintenance; older worker release; no successful sync yet.
- **Acceptance criteria:** Owner can recover controlled fake outage without SQL edits or duplicate effects; staff sees stale/maintenance explanation.
- **Required tests:** Outage->rotate->resume->reconcile E2E, stale lease, permission and secret-log scan.
- **Definition of done:** Shared DoD plus exact operational commands and escalation conditions documented.

### T059: Implement retention and optional notification delivery

- **Task ID:** T059
- **Objective:** Implement retention and optional notification delivery.
- **Dependencies:** T007, T011, T044, T045, T050, T054.
- **Files or modules:** src/server/operations/retention.ts; notifications.ts; notification job handlers; privacy settings.
- **Detailed behavior:** Daily redact reservation/waitlist contact/notes90days after terminal/end date, expire public/staff request responses and exports, retain deidentified operations/audit. Optional confirmations/owner alerts use deduped outbox and configured recipients; login mail remains Auth.js protocol.
- **Edge cases:** Redaction retries; future active reservation; old backup restore; SMTP failure; repeated alert; marketing flag absent.
- **Acceptance criteria:** Expired PII disappears from DB/exports/logs without breaking reservation uniqueness/history; mail failure never cancels booking.
- **Required tests:** Clock-controlled retention, orphan job/reference safety, duplicate notification, invalid recipient config and backup-retention checklist.
- **Definition of done:** Shared DoD plus privacy policy settings and35-day backup age-out documented; no marketing messages implemented.

## Verification and launch gates (T060-T068)

### T060: Complete API contract and security boundary verification

- **Task ID:** T060
- **Objective:** Complete API contract and security boundary verification.
- **Dependencies:** T009, T019, T044, T051, T054, T058, T059.
- **Files or modules:** tests/contracts; tests/security; API schema snapshots; CI configuration.
- **Detailed behavior:** Cover every API route/method and error envelope; run full role/tenant/location matrix, CSRF/origin, rate buckets, body limits, public PII, webhook forgery, secret scan, cache isolation and audit redaction. Use direct service calls as well as HTTP.
- **Edge cases:** Foreign nested IDs; job/export IDOR; valid session after demotion; formula injection; signed irrelevant webhook; X-Forwarded-For spoof.
- **Acceptance criteria:** All endpoint contracts and security acceptance rows pass; no server-only dependency in browser artifact.
- **Required tests:** TESTING security/contract suites, dependency audit triage and negative-path integration tests.
- **Definition of done:** Shared DoD plus unresolved security findings classified and critical/high findings resolved before launch.

### T061: Complete cross-domain journeys and crash/concurrency acceptance

- **Task ID:** T061
- **Objective:** Complete cross-domain journeys and crash/concurrency acceptance.
- **Dependencies:** T039, T049, T055, T056, T057, T060.
- **Files or modules:** tests/e2e; tests/integration/concurrency; docs/ACCEPTANCE_EVIDENCE.md.
- **Detailed behavior:** Run owner login->fake catalog->recipe->opening count->receive->sale->cost dashboard->public booking->host seating plus correction/refund/count/replay variants. Inject worker restart and DB rollback at posting checkpoints; use real PostgreSQL and multi-client barriers.
- **Edge cases:** Duplicate requests/events; after-commit response lost; source update while projecting; no mail; two hosts; DST.
- **Acceptance criteria:** All source-plan success criteria have explicit passing fixture evidence; repeated full journey leaves identical source/ledger totals.
- **Required tests:** Full TESTING acceptance matrix and recovery/concurrency cases; E2E uses captured local magic links, never production bypass.
- **Definition of done:** Shared DoD plus evidence links and exact commands; no skipped critical tests.

### T062: Run Taste visual and accessibility release verification

- **Task ID:** T062
- **Objective:** Run Taste visual and accessibility release verification.
- **Dependencies:** T008, T020, T027, T037, T038, T047, T048, T049, T055, T058.
- **Files or modules:** UI pages; .taste-skill evidence; tests/e2e/accessibility; docs/VISUAL_QA.md.
- **Detailed behavior:** Use the pinned Taste app-screen workflow on the production-built artifact with APP_ENV=test/staging and synthetic fixtures at 1440/768/390. The official inspector can check public booking but cannot authenticate protected pages; use a real seeded magic-link session and authenticated Playwright screenshots for staff pages, plus source lint and the documented app critique. Never claim the login redirect was a dashboard inspection. Inspect every screenshot, document critique and fix highest-priority defects; test public booking as functional form, not decorative marketing page. Run keyboard/contrast/reduced-motion checks.
- **Edge cases:** Inspector cannot access login; narrow tables; zoom 200%; long labels; stale/empty/error states; script warnings conflicting with accessibility.
- **Acceptance criteria:** Zero unexplained measured failures on public inspector runs and authenticated staff browser checks, no critical accessibility violations, all target pages usable on phone and desktop; the official inspector authentication limitation is explicitly recorded.
- **Required tests:** Production-build visual inspection, axe checks, keyboard and screen-reader spot checks, responsive snapshots.
- **Definition of done:** Shared DoD plus actual screenshots/critique/evidence; do not claim visual checks from source lint alone.

### T063: Validate query plans, load and operational limits

- **Task ID:** T063
- **Objective:** Validate query plans, load and operational limits.
- **Dependencies:** T018, T036, T042, T051, T052, T054, T061.
- **Files or modules:** tests/performance; query indexes; src/server/reporting; docs/PERFORMANCE.md.
- **Detailed behavior:** Generate 100k order-line fixture and realistic ingredients/tables. Measure p95 lists<=1s, reports<=3s, booking<=2s; explain slow queries and add justified indexes/bounded aggregation. Measure webhook ack<10s and page worker45s budget. Avoid new infrastructure unless measurements require it.
- **Edge cases:** 366-day reports; N+1 cost lookup; busy table allocator; queue backlog; 20 concurrent bookings; oversized export.
- **Acceptance criteria:** Published target metrics met on documented deployment-like hardware; zero overlap/duplicate deductions under load.
- **Required tests:** Repeatable load/query-plan tests and invariant SQL after load; one measured follow-up after any optimization.
- **Definition of done:** Shared DoD plus hardware/data size/commands/results and known scaling ceiling documented.

### T064: Prepare deployment, migrations and operational runbooks

- **Task ID:** T064
- **Objective:** Prepare deployment, migrations and operational runbooks.
- **Dependencies:** T010, T011, T058, T059, T060, T063.
- **Files or modules:** deployment configs; .env.example; README.md; docs/RUNBOOKS.md; CI release workflow.
- **Detailed behavior:** Document Vercel web+same-repo Node worker+managed PostgreSQL17, secret provisioning, SMTP, HTTPS, signature URL andpool/direct connections. Add additive migration once-before-rollout process, compatible web/worker releases, maintenance mode, rollback/forward-fix and owner health alert configuration.
- **Edge cases:** Missing btree_gist; serverless pool exhaustion; new worker on old schema; expired TLS callback; demo flags in prod.
- **Acceptance criteria:** New staging deploy starts from instructions without undocumented secrets; worker and web release match; no production db push.
- **Required tests:** Staging migration from prior release, fresh deploy, health smoke, secret/env failure and code rollback rehearsal.
- **Definition of done:** Shared DoD plus provider backup/PITR capabilities and hosting costs recorded for operator review.

### T065: Rehearse backup restore and manual-service continuity

- **Task ID:** T065
- **Objective:** Rehearse backup restore and manual-service continuity.
- **Dependencies:** T054, T058, T059, T064.
- **Files or modules:** docs/RUNBOOKS.md; docs/RECOVERY_EVIDENCE.md; scripts/verify-restored-db.ts.
- **Detailed behavior:** Restore staging backup to isolated DB, verify constraints/audit/count anchors, stop writes/workers, replay Square overlap, compare immutable totals and local booking/receipt records. Rehearse host export/manual booking reconciliation and reopening public flow. Record RPO<=15min/RTO<=4h measured vs target.
- **Edge cases:** Local bookings/receipts lost after backup cannot be fetched from Square; PII redaction tombstones; restore creates duplicate scheduler attempts.
- **Acceptance criteria:** Restore meets target or launch blocked with explicit remediation; no automatic public reopening before conflicts checked.
- **Required tests:** Restore drill invariant queries, E2E smoke, queue replay and manual fallback checklist.
- **Definition of done:** Shared DoD plus dated operator evidence and quarterly drill schedule in runbook; no real data copied into CI.

### T066: Execute controlled Square Sandbox capability verification

- **Task ID:** T066
- **Objective:** Execute controlled Square Sandbox capability verification.
- **Dependencies:** T013, T018, T019, T036, T051, T056, T064.
- **Files or modules:** docs/SQUARE_INTEGRATION.md verification register; docs/INTEGRATION_EVIDENCE.md; opt-in sandbox scripts/tests.
- **Detailed behavior:** With securely supplied sandbox access, execute Square gates SQ-V2/SQ-V3 and TESTING cases SQ-01 through SQ-03: identity, catalog nested/deleted, pagination, updated-at old pending objects, return/custom refund/exchange, signatures, rotation and outage recovery. Capture sanitized IDs/version/date/results and update unsupported assumptions.
- **Edge cases:** Sandbox cannot prove POS device coverage; account lacks event/sample feature; endpoint filter behavior differs from fixture.
- **Acceptance criteria:** Every sandbox capability required for launch has evidence or a documented safe fallback; no claim of live device verification.
- **Required tests:** Opt-in sandbox contract suite and reconciliation/duplicate invariant checks; CI remains fake-only.
- **Definition of done:** Shared DoD plus exact SDK/API pair and failed/unavailable cases retained honestly.

### T067: Verify representative Square Free and Plus POS/device workflows

- **Task ID:** T067
- **Objective:** Verify representative Square Free and Plus POS/device workflows.
- **Dependencies:** T020, T036, T039, T049, T055, T056, T065, T066.
- **Files or modules:** docs/INTEGRATION_EVIDENCE.md; operator launch checklist.
- **Detailed behavior:** Operator-assisted controlled tests on intended Free and Plus configurations verify real completed cash/card/split tender, discount/tax/tip/modifiers, offline arrival, events/refunds/exchanges anddate meanings. Follow transaction exposure plan approved by restaurant operator; RestaurantOS still only reads.
- **Edge cases:** POS-created order.created absent; offline delay beyond window; missing paid features; Plus-only UI should never be dependency; ambiguous refunds.
- **Acceptance criteria:** Same core RestaurantOS feature paths work on both plans; required device/account cases evidenced or launch expressly held; polling works without event.
- **Required tests:** Square gates SQ-V4 through SQ-V6 and TESTING cases SQ-04 through SQ-07 with independent Square totals vsimports/ledger comparison; controlled refund cost/stock checks.
- **Definition of done:** Shared DoD plus operator evidence; do not simulate a second plan or mark an unavailable account tested.

### T068: Complete final production acceptance and handoff

- **Task ID:** T068
- **Objective:** Complete final production acceptance and handoff.
- **Dependencies:** T061, T062, T063, T065, T066, T067.
- **Files or modules:** docs/PRD.md; ARCHITECTURE.md; DATABASE.md; API_CONTRACTS.md; SQUARE_INTEGRATION.md; UI_DESIGN.md; TESTING.md; IMPLEMENTATION_TASKS.md; release checklist.
- **Detailed behavior:** Audit requirement->task->test coverage, scope/enum/field/formula consistency andsource evidence; review security/recovery and Free/Plus gates. Produce operator handoff with setup, remaining limitations, role training, known data freshness andmanual service procedures. Release only with all mandatory gates met.
- **Edge cases:** Unresolved unknown refund split is allowed visible state, not a fabricated net-sales value; untested device capability remains release risk; optional email not enabled.
- **Acceptance criteria:** All eight plans reflect actual implementation; no P0/P1 integrity/security defect or unexplained failed launch gate; owner can operate and recover system.
- **Required tests:** Final clean install/migrations/build/lint/typecheck/unit/integration/E2E plus acceptance evidence review; rerun only after relevant changes.
- **Definition of done:** Shared DoD plus reviewed release decision and accurate unresolved limitations; deployment/publishing follows user's then-current authorization.

## Execution rules and gates

1. Implement one task at a time per coding agent; parallelize only dependency-independent tasks with disjoint file ownership. Apply database migrations in numeric order even when service work overlaps.
2. Do not mark a task done from code review alone. Record actual commands/results. External tests require real access and remain NOT_RUN without it; no fixture substitutes for T066/T067.
3. After foundation, Square, recipe, inventory, reservation and reporting gates, report working behavior, schema changes and next dependencies. A later request limited to one phase ends at that boundary.
4. UI tasks use the shared services/contracts. Do not build client-only business logic or invent a second auth system. Future controls are omitted until their backing task exists.
5. All post-v1 features require a new approved scope: OAuth onboarding, multi-location operation, KDS, payments, payroll, loyalty and supplier auto-ordering are not hidden follow-ups in these tasks.
6. The planning delivery is complete when the eight documents and consistency review are complete. T001 is the documentation/evidence baseline task and may be completed without application code. At planning delivery, T002-T068 were future implementation work; task statuses above are authoritative.

## Planning review disposition

| Risk / contradiction found | Binding resolution | Verification |
| --- | --- | --- |
| Embedded source kickoff says implement Phase1 | Current user request is planning only. | No app code created. |
| Personal token described as read-only permissions | Token is unrestricted; gateway allowlists reads; scoped OAuth deferred. | T013, T014, T060, T066. |
| POS order.created/event coverage uncertain | Polling mandatory; events only hints; physical device evidence. | T018, T019, T067. |
| Refund means reverse food stock | Money refunds retain prepared usage; explicit recoverable adjustment or source correction only. | T036, T051, T061. |
| Old sales arrive after physical count | Immutable history retained; latest physical anchor absorbs earlier effective movements. | T035, T036, T061. |
| Source close time changes across anchor | Quarantine inventory and preview old-time reversal/new-time replacement. | T016, T057. |
| Returned order duplicates original sale/refund | Only own new sale lines count; canonical refund IDs once. | T016, T017, T051, T066. |
| Unknown cost/mapping appears as zero margin cost | Null/coverage states and matched-subset denominator; no guessed quantity. | T028, T036, T052, T055. |
| Concurrent combined-table booking | Serialized allocator plus DB exclusion on every physical table. | T040, T042, T049. |
| Restore can reconstruct all local data from Square | Local reservations/receipts need backups/manual recovery; reopening controlled. | T065. |
| Installed Taste version differs from linked repository | Use pinned linked source and app-screen guidance in UI_DESIGN. | T001, T008, T062. |

Live credentials, merchant entitlement and physical POS behavior cannot be proven by writing this plan. They are explicit acceptance gates, not assumed capabilities. The implementation can proceed with fake fixtures while these gates remain NOT_RUN.

Planning verification: all eight requested planning documents exist; T001-T068 are unique and in dependency order; every task has all nine required fields; relative document links, Markdown table structure, UTF-8 text and code fences pass document checks. Independent domain reviews resolved the contradictions recorded above, plus invitation/migration ordering, authenticated visual inspection, current-status public replay, early/late seating and overdue seated-table presence. At T001 completion, the dependency/evidence baseline was recorded in [DEPENDENCY_BASELINE](DEPENDENCY_BASELINE.md); no application code had yet been created. At planning delivery, T002-T068 were unexecuted and no application builds or tests had run; the task status entries above record later implementation and validation. Taste source coverage and the unavailable ancillary colour reference are disclosed in UI_DESIGN; external launch gates remain deliberately unrun.
