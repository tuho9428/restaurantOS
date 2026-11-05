# RestaurantOS product requirements

Planning baseline: 2026-11-04, America/Los_Angeles. This is a specification; no application or external integration is implemented by this planning exercise. Read with [architecture](ARCHITECTURE.md), [database](DATABASE.md), [API contracts](API_CONTRACTS.md), [Square integration](SQUARE_INTEGRATION.md), [UI](UI_DESIGN.md), [testing](TESTING.md), and [implementation tasks](IMPLEMENTATION_TASKS.md).

## 1. Product purpose and operating boundary

RestaurantOS is an internal operations application for one Seattle full-service restaurant with approximately 40–60 seats. It reduces repeated back-office work and makes ingredient usage and recipe economics understandable. v1 supports one restaurant, one active location, USD, and either Square Free or Square Plus through the same workflows. Database scoping prepares for future expansion but v1 does not expose SaaS onboarding, merchant billing, self-registration, or multi-location switching.

Square remains authoritative for catalog items/variations, POS orders, payments, refunds, native checks and payment status. RestaurantOS imports these read-only; it never initiates a payment/refund or changes a check to mimic a paid Square feature. RestaurantOS owns raw ingredients, recipes, procurement, theoretical stock estimates, physical counts, reservations, waitlist and its operational audit history. Its seating records do not claim to match Square tables.

The source `RESTAURANT_OS_CODEX_PLAN.md` supplies the product contract. Its sample implementation kickoff is historical guidance, not authorization to implement code now. The binding decision register in ARCHITECTURE resolves deliberate refinements, including no automatic restocking for financial refunds and the choice of invite-only magic-link authentication.

## 2. Users, permissions and access boundaries

Every staff operation requires an authenticated active membership and an allowed location. UI visibility is a convenience; authorization is enforced independently in reads, writes, aggregates, exports, background-job status and recovery commands. An OWNER bootstraps via operator CLI. Invitations create allowed memberships; no public user registration exists. Auth.js sends 15-minute email links, creates database sessions up to 12 hours, and membership suspension immediately blocks existing sessions.

Legend: R = read; W = create/update/authorized status transitions; A = privileged administrative action; none = forbidden. A permission never grants access outside the membership's restaurant/location. Report access includes recipe cost and margin aggregates, not guest contacts or raw payment records.

| Capability | OWNER | MANAGER | HOST | INVENTORY | VIEWER |
| --- | --- | --- | --- | --- | --- |
| Aggregate owner dashboard and reports, report CSV | R | R | none | none | R |
| Ingredients, packages, supplier directory, cost history | W | W | none | W | none |
| Record opening/manual ingredient cost basis with reason | W | W | none | none | none |
| Recipe drafts, versions, publication and modifier mappings | W | W | none | none | none |
| Purchase orders, partial receipts and receipt reversals | W | W | none | W | none |
| Stock estimates, movements, waste, physical counts, reasoned manual corrections | W | W | none | W | none |
| Reservation contacts, host view, staff bookings, walk-ins and waitlist | W | W | W | none | none |
| Tables, approved combinations, hours, booking rules and closure configuration | W | W | R | none | none |
| One-service-date host sheet export, including necessary contact (fresh login) | W | W | W | none | none |
| Inventory operational CSV export | W | W | none | W | none |
| Purchasing aggregate CSV export | W | W | none | W | R |
| Imported catalog, sales, payment/refund detail, reconciliation issues | R | R | none | none | none |
| Verified refund allocation and reconciliation notes | W | W | none | none | none |
| Square status visible in permitted dashboard context | R | R | none | none | R |
| Test/configure Square, manual sync/backfill, dead-job replay, projection replay | A | none | none | none | none |
| Memberships, role changes, restaurant settings and business-day policy | A | none | none | none | none |
| Own session/profile and sign out | W | W | W | W | W |
| Audit history and private operational/recovery health | R/A | none | none | none | none |

INVENTORY can correct an operational posting only through an audited linked reversal/replacement or manual adjustment with a required reason; it cannot rewrite posted history. HOST may create a reservation with tables selected from available approved candidates but cannot create/disable tables or override overlap/capacity rules. MANAGER cannot change credentials, roles, source data, or initiate historical maintenance replay. VIEWER exports contain only the authorized aggregate report dataset. Exact route policy codes and export types are in API_CONTRACTS.

The last active OWNER cannot be suspended/demoted. Credential configuration, role changes and any contact-bearing host sheet export require authentication within 15 minutes. v1 has no bulk contact-list export or marketing export; the host sheet is limited to one service date. A foreign/inaccessible record ID returns 404; an accessible record with a forbidden operation returns 403. Public booking exposes only published restaurant facts, available times and the guest's own confirmation reference.

## 3. v1 feature requirements

| ID | Requirement | Observable result |
| --- | --- | --- |
| P01 | Secure foundation | Invited users sign in, navigate only allowed modules, and lose access immediately when suspended. Synthetic demo data works without Square credentials. |
| P02 | Read-only Square connection | Owner configures an operator-managed secret reference, tests merchant identity/environment and selects the single allowed location. Sandbox and production cannot mix. |
| P03 | Durable source import | Catalog plus 90-day initial order/payment/refund backfill is resumable, paginated and idempotent. Source revisions and late arrivals update canonical records without creating a second sale. |
| P04 | Honest integration status | Independent catalog/orders/payments/refunds and projection freshness, retries, unresolved issues and worker health are visible. Webhooks accelerate work; polling and reconciliation remain required. |
| P05 | Ingredients and acquisition costs | Base units g/ml/each, compatible conversions, supplier packs, reorder levels and timestamped acquisition costs support exact decimal costing. Missing cost is distinguishable from zero. |
| P06 | Variation recipes | One effective mapping per Square variation, immutable published versions, yields/loss and explicit modifier effects produce reproducible historical recipe snapshots. No recursive subrecipes in v1. |
| P07 | Purchasing and receiving | Supplier/PO workflow supports partial receipts and actual prices; the same receipt cannot add stock twice. Draft edits do not affect stock. |
| P08 | Auditable stock | Receipts, waste, authorized adjustments and theoretical sale usage append immutable movements. Physical counts anchor estimates. Negative estimates warn without silently discarding source sales. |
| P09 | Restaurant-owned reservations | Public booking, host day view, staff reservations, walk-ins and approved combinations use one concurrency-safe allocator. Two overlapping claims for a physical table cannot both commit. |
| P10 | Waitlist | Waiting/notified parties can be canceled/marked left or seated atomically into a reservation. Joining a waitlist reserves no table; NOTIFIED records manual contact, not automated SMS. |
| P11 | Decision-grade reporting | Menu mix, sales, theoretical cost, food-cost percentage, contribution margin, procurement spend, waste and reconciliation display source/time/coverage and null unknown measures. |
| P12 | Export and audit | Authorized CSV exports preserve current filters, escape spreadsheet formula injection, record an audit event and expire downloads. Sensitive/posted mutations and replay have actor/reason/history. |
| P13 | Operability and recovery | Backups, tested restore, health alerts, bounded replay and paper/export fallback protect service continuity. Square continues operating when RestaurantOS is unavailable. |

## 4. Business workflows and state rules

### W01: Connect, import and reconcile

OWNER selects Sandbox or Production and the installed credential reference, tests the connected merchant, then enqueues a sync. Initial import discovers locations/catalog and runs bounded daily windows for the preceding 90 days. Progress is durable; leaving the page does not cancel work. Repeat sync and webhook redelivery upsert source identity/revision and do not duplicate sales, payment/refund records or stock effects. Background polling runs every 15 minutes with overlap, nightly reconciliation covers the previous seven business days and weekly reconciliation covers 90 days. Owner can preview and run bounded older replay; failure remains visible until resolved.

Only COMPLETED orders' own positive sale lines contribute finalized menu sales. OPEN/DRAFT/CANCELED orders do not generate prepared-sale deductions. Payments track collections rather than another sale, and COMPLETED refunds are counted once from canonical refund identity. Unlinked tenders, incomplete metadata, delayed offline source data and inconsistent totals enter reconciliation; staff do not fabricate matching lines. Confirmed API support and sandbox/device release gates are separate in SQUARE_INTEGRATION.

### W02: Define ingredient and recipe economics

Authorized staff create ingredients with exactly one base dimension and one base unit. A pack explicitly states base quantity and supplier SKU; conversions across mass/volume require an ingredient-specific configured conversion and are not inferred from names. MANAGER/OWNER record opening acquisition costs or use posted receipt costs. Costs exclude separately recorded taxes, delivery and fees. New costs apply prospectively by effective date; historic sale snapshots stay reproducible.

MANAGER/OWNER creates a recipe draft, sets positive yielded portions, ingredient quantities and loss fractions below one, then links a Square variation. Publishing creates a new effective version and preserves the prior one. Modifiers have explicit signed ingredient effects or an acknowledged no-effect mapping. Any selected unknown modifier/base mapping makes the entire sale line's usage unknown; do not guess partial deduction. Missing ingredient price alone still permits known quantity usage but leaves cost unknown. Future sales use their effective recipe/cost basis. Retrospective mapping/cost repairs require the owner's previewed, audited replay.

### W03: Purchase, receive and correct stock

A PO moves through DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELED or CLOSED using the API-defined transitions. Receiving selects PO lines or creates a direct receipt, records actual delivered base quantities and ingredient acquisition amounts, and posts once. A partially delivered PO retains the remaining quantity. Over-receipt is rejected; staff first amend ordered quantities with a required reason if accepting overdelivery. CLOSE_SHORT records an accepted underdelivery with reason. Posted receipts cannot be edited in place. Correction reverses the eligible original receipt once and posts a replacement as a separate operation, updating PO outstanding quantities and cost eligibility atomically.

Waste requires positive entered quantity and a reason; the service posts a negative movement. A manual adjustment requires signed nonzero quantity and a reason. Financial refunds do not automatically restore food already prepared. A recoverable physical return is an explicit reasoned adjustment; a source order quantity correction/cancellation changes desired theoretical usage through a new delta.

### W04: Count physical stock

Staff perform counts during a controlled pause in preparation/receiving and acknowledge any physical activity during counting. Posting assigns a server cutoff after acquiring ingredient locks, stores expected/actual/variance and sets the physical anchor per counted ingredient. Current estimated quantity equals latest counted quantity plus subsequent effective movements. A late pre-count sale remains theoretical historical usage and does not deduct current stock again. Posting the same count twice has one effect. Missing ingredients in a partial count receive no new anchor. The UI labels balances as estimates between counts, includes the anchor and flags negative balances/unknown usage.

### W05: Configure and accept bookings

MANAGER/OWNER creates physical tables and explicit approved combinations, configures opening hours/closures, contact instructions and published privacy/booking terms, then enables public booking. Defaults are 15-minute slot steps, 90-minute dining duration, zero pre-buffer, 15-minute cleanup, 30-minute notice, 90-day horizon and public parties 1–8. Larger parties contact staff. The full dining interval must fit hours; cleanup may extend past closing only when explicitly enabled. Existing bookings retain their duration/buffer snapshots.

Guest visits `/book/[restaurantSlug]`, selects party/date/time, enters name and at least one contact, accepts versioned privacy/booking terms and submits. Marketing opt-in is separate and off. Availability does not hold capacity. Submission atomically revalidates hours/blocks/capacity and claims every physical table in the selected allocation. Competing requests receive an unavailable-slot response and refreshed alternatives. Success returns an opaque reference, local time/timezone and host contact instructions. v1 has no public guest lookup or self-service cancellation token; changes go through the host.

### W06: Host service, seating and waitlist

HOST/manager opens a date-based agenda and availability grid. A CONFIRMED reservation can be edited, seated, canceled, or marked NO_SHOW at/after its start; SEATED can complete. COMPLETE means staff confirm the table is cleared and ready, releasing its entire claim including cleanup buffer; it is unrelated to Square payment/check status. Terminal reservations cannot reopen. Editing allocation is atomic: failure preserves the original booking. SEAT preserves scheduled start, records server seating time and extends occupied start/end to cover early/late seating plus duration/buffers. If extension conflicts, seating fails visibly and staff must choose a valid alternative. Staff cannot force a conflicting seat. Walk-in and waitlist seat actions create normal allocated SEATED reservations. No timer automatically marks no-shows or releases a seated table; staff complete the reservation. An overdue SEATED party keeps the physical table blocked from new allocations until the host extends/reassigns or clears it. Existing future reservations remain recorded and cannot be seated onto that occupied table. Display a persistent overdue warning and require operational resolution; elapsed expected end is never proof of a clear table.

### W07: Review sales, cost and reconciliation

Reports use the restaurant's business-date convention (default America/Los_Angeles, 03:00 local cutoff) with explicit inclusive/exclusive range. Store UTC and distinguish order close, payment, refund and import time. DST rules and prospective policy changes follow ARCHITECTURE.

Base menu revenue excludes tax, tip and service charges and includes source line discount allocation. A completed refund is split into verified menu/tax/tip/service/other portions; order return totals and payment refunded totals are not subtracted again. Unresolved refund allocation makes affected net menu sales unknown and displays before-unallocated-refund revenue plus unresolved amount. Food-cost percentage and contribution margin require complete cost/refund coverage and positive revenue. Partial reports may expose a clearly labeled known subset using its matching revenue denominator. Contribution margin excludes labor, rent, processing fees and overhead and is never called net profit. Procurement reports show posted gross spend, reversal events and net spend on their respective posting dates.

### W08: Recover an incident

Square outage/revocation pauses external work without blocking local inventory/reservations. Display stale status, preserve cursors and resume overlap polling after credentials recover. App outage leaves Square operational; hosts use a current protected reservation export/paper log. During DB recovery, disable public booking and business writes, restore an isolated backup, verify constraints/ledger, reconcile manual local changes and replay Square before reopening. Square cannot reconstruct lost local reservations or receipts. Target RPO 15 minutes and RTO four hours must be proven by a restore drill, not advertised as achieved before testing.

## 5. Quality, privacy and operational requirements

- Mobile staff workflows work at 360px; the host can book/seat without hover, drag-only controls or horizontally scrolling the page. Owner reports support wide displays with accessible table alternatives to charts.
- WCAG 2.2 AA is the target: keyboard flows, focus management, text/controls contrast, descriptive errors, reduced motion and non-color status cues. Exact UI states and verification are in UI_DESIGN/TESTING.
- Quantities use exact decimal arithmetic; money is integer USD cents exposed as integer strings. Null means unknown, never zero by default. Reject malformed/out-of-range values server-side.
- All mutations validate schemas, scope/permission, concurrency version and idempotency as applicable; business and audit effects commit together. Request replay alone does not replace permanent source/posting uniqueness.
- No Square/customer card data or secrets in browser DTOs, unrestricted payload storage, logs, analytics or audit diffs. Secrets remain deployment-managed references. Public requests are rate-limited with anti-spam; failed login responses do not enumerate staff.
- Retain guest contact/notes for 90 days from the fixed terminal timestamp, then redact. If no terminal transition exists, use past reservation end or waitlist joined time as the retention anchor; later note edits do not extend retention. Backups age out redacted PII within 35 days. Retain financial/ledger/audit history seven years as an operational policy subject to operator review. Marketing consent does not activate messaging in v1.
- Production runs one modular monolith and a durable worker from the same repository, with PostgreSQL backups/PITR, fresh operational heartbeats, bounded retries and owner alert delivery. Deployment does not rely on long-running request handlers.

## 6. Explicit exclusions and future scope

v1 excludes payment capture, initiating refunds/tips, Square check editing, native floor-plan/table synchronization, KDS replacement or guaranteed live POS order display. Also exclude payroll/tax filings, advanced staffing/time tracking, loyalty/marketing automation, delivery dispatch, marketplace distribution, automated supplier ordering, forecasting promises, nested recipes, public merchant onboarding, billing, multi-location UI and OAuth implementation. A future OAuth design is documented for expansion but is not a v1 task prerequisite.

Optional later phases include staff checklists, delivery reminders, purchasing recommendations, richer recipe cost valuation, scheduling requests and multiple merchants/locations. None may bypass v1 integrity or acceptance gates.

## 7. Acceptance and release criteria

| Gate | Must be demonstrated |
| --- | --- |
| G1 Foundation | Invite-only sign-in; full role/tenant/location denial matrix; immediate suspension; no production demo bypass; reproducible seed/CI. |
| G2 Source integration | Fake plus controlled Sandbox tests; API pin/scopes recorded; repeated and out-of-order imports converge; signed/forged webhooks; stale outage mode; actual POS-device verification recorded separately. |
| G3 Costing | Exact unit/yield/modifier fixtures; versioned costs; unknown versus zero; whole-line unknown usage and historical replay preview safeguards. |
| G4 Inventory | Partial receipt/reversal uniqueness; sale correction deltas; financial refund no restock; same-slot count concurrency; late pre-count sales and partial counts. |
| G5 Reservations | Public/staff/walk-in/waitlist concurrency; individual and combined tables; edit/seat rollback; hours/buffers/DST/lead/horizon; privacy/rate limits. |
| G6 Reporting | Golden financial fixtures; no double sale/refund; partial coverage nulls/subset denominator; supplier reversals; consistent CSV and source/freshness. |
| G7 Production | Build/typecheck/lint/tests; migrations with custom constraints; backup restore/RPO/RTO evidence; secret scan; accessible responsive screenshots; owner operating/recovery checklist. |

All v1 requirements P01–P13 and workflows W01–W08 must be covered by the dependency-ordered implementation tasks and TESTING evidence. Sandbox/production proofs requiring credentials remain explicit release blockers until executed; a mock pass does not satisfy them. No release claim should imply that financial reporting is an accounting/tax system or that an estimated inventory balance is a physical measurement.
