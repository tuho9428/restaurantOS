# Square integration contract

Status: implementation specification; researched November 4, 2026. No credentials, Square account access, sandbox exercises, or physical-device tests have been performed for this plan. Read with [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [API_CONTRACTS.md](API_CONTRACTS.md), and [TESTING.md](TESTING.md).

## 1. Authority, versions, and product boundaries

Square owns its catalog, POS checks, completed transactions, payments, refunds, and native inventory. RestaurantOS stores read-only replicas and owns ingredients, recipes, purchasing, its ingredient ledger, reservations, seating, and calculated reports. Never write RestaurantOS reservations, tables, raw stock, or recipe changes into Square.

Pin the official Node package to **`square@46.0.0`**, without a semver range, and commit the lockfile. Pin all API requests and Developer Console webhook subscriptions to **`2026-09-16`**. The [Square SDK release](https://github.com/square/square-nodejs-sdk/releases/tag/46.0.0) explicitly pairs these versions; the [Node SDK documentation](https://developer.squareup.com/docs/sdks/nodejs) identifies the v40 SDK rewrite. Do not copy pre-v40 client construction or parameter names. A later upgrade is a deliberate change with fixture, sandbox, and subscription-version review; it is not an automatic dependency update.

The implementation has no Square-plan feature branches. Both Free and Plus use the same read-only contract. API references describe permissions without requiring a paid restaurant plan for these reads; actual account access and POS payload differences remain launch verification gates. Do not label compatibility proven until the representative-account tests in section 10 pass.

| Capability | Evidence status | Binding decision |
|---|---|---|
| Read merchant locations and catalog | Confirmed documented APIs | Read only; explicitly select one active USD location. |
| Read completed POS orders, payments, refunds | Confirmed documented APIs | Replicate and reconcile; preserve original external IDs. |
| Incremental order searches and paging | Confirmed | Mandatory polling independent of webhooks. |
| Catalog tombstones | Confirmed through SearchCatalogObjects | Store `is_deleted`; retain historical mappings. |
| Payment/refund updated-at search fields | Confirmed in pinned reference | Verify SDK serialization and combined time bounds in sandbox; use fallback below if unavailable. |
| `order.created` for POS creation | Reference explicitly says it does not fire | Never use as the sales-completeness mechanism. |
| `order.updated` on all restaurant device workflows | Not guaranteed by endpoint reference | Treat as optional acceleration; prove device behavior separately. |
| Complete native floor plans/tables/open dine-in check editing | No dependable supported contract established | Excluded; no invented endpoints, scraping, or two-way table sync. |
| Square Bookings for restaurant table allocation | Not the RestaurantOS reservation contract | Do not use appointments APIs for this feature. |
| Real-time kitchen display or guaranteed live stock | Not established | Excluded; show freshness and estimated ingredient balance. |
| Free/Plus parity for intended merchant/device combinations | Requires account and device evidence | Release gate, not a product subscription assumption. |

[Orders visibility](https://developer.squareup.com/docs/orders-api/what-it-does) confirms access to completed POS orders. The [order.created reference](https://developer.squareup.com/reference/square/webhooks/order.created) specifically excludes POS creation. The [order.updated reference](https://developer.squareup.com/reference/square/webhooks/order.updated) lists API/Order Manager/Dashboard triggers; generic webhook descriptions must not override those narrower guarantees.

## 2. Credentials and connection lifecycle

### V1: own-account personal token

An operator provisions separate production and sandbox personal access tokens in the deployment secret manager. `square_connections.secret_ref` identifies a configured server secret; neither plaintext credentials nor encrypted token blobs are returned to the browser. `.env.example` contains variable names and empty placeholders only. The owner connection screen selects an environment and provisioned credential alias; it does not accept or display the secret value. Local development may resolve the alias to a server-only environment variable. Never prefix these values with `NEXT_PUBLIC_`.

Personal tokens are valid for a privately operated production integration, but they grant unrestricted Square account access. **Read-only describes RestaurantOS behavior, not token enforcement.** The gateway allowlist in section 3 and tests prohibit write methods. This distinction follows the official [token guidance](https://developer.squareup.com/docs/build-basics/access-tokens).

Connection test: resolve secret; request configured merchant and locations; verify merchant identity, environment, chosen location membership/status/currency; make bounded catalog/order/payment/refund read probes. Persist sanitized results and `verified_at`, never payloads containing credentials. Connection states are `UNCONFIGURED`, `ACTIVE`, `DEGRADED`, `REAUTH_REQUIRED`, `DISABLED`. `ACTIVE` means credential checks succeeded, not that backfill or reconciliation is complete. `401` invalidates health and stops automatic credential retries. `403` also pauses external work and produces a permissions/configuration exception for operator resolution. A temporary timeout/429/5xx gives `DEGRADED`, preserving last valid imported data.

Bind one active Square connection per restaurant/environment and one selected production location in v1. Sandbox records must not share a reporting scope with production. Resource uniqueness includes connection identity, which in turn fixes merchant and environment. Token rotation for the same merchant/location retains that identity; changing merchant or environment requires a distinct connection and explicit new import scope. Disable and audit rather than delete a connection containing history.

### Future OAuth: documented, not implemented in v1

Future merchant onboarding uses Square's server authorization-code flow with exact allowlisted redirect URI, HTTPS, a cryptographically random one-use `state` bound to the initiating owner/session/environment, short expiration, and server-side token exchange. Request only `MERCHANT_PROFILE_READ`, `ITEMS_READ`, `ORDERS_READ`, `PAYMENTS_READ`. Do not request write, bookings, inventory, customer, or labor scopes. See [permissions](https://developer.squareup.com/docs/oauth-api/square-permissions).

Store tokens in the secret manager, track expiry metadata in SQL, refresh under a per-connection lock before expiry, replace credentials atomically, and invalidate on revocation. Current [OAuth documentation](https://developer.squareup.com/docs/oauth-api/overview) says code-flow access tokens expire after 30 days; code-flow refresh tokens differ from PKCE-flow token lifecycle. Do not assume a code-flow `code_challenge` parameter is supported. Verify current support before adopting PKCE with that flow, or follow Square's documented PKCE flow end to end if the client model changes. Test state replay, authorization denial, missing scopes, concurrent refresh, revoked access, and environment mismatch before enabling OAuth. Webhook-subscription/Events APIs require application credentials; seller OAuth is not sufficient for those management calls.

## 3. Gateway boundary and normalized data

Only `src/server/square/gateway.ts` and its official-SDK adapter may import `square`. Implement a shared normalizer with environment-configured Sandbox/Production adapters and a deterministic `FakeSquareGateway`. No business service depends on SDK response classes. The following are interface specifications, not application code:

```ts
type Instant = string; // validated UTC RFC3339, millisecond precision
type Minor = string; // signed base-10 integer cents; no scientific notation
type Quantity = string; // validated Decimal base-10 string, at most 6 fractional digits
type Cursor = string;
type Page<T> = { items: T[]; nextCursor: Cursor | null };
type Window = { from: Instant; to: Instant }; // canonical internal [from,to)
type GatewayContext = { requestId: string; timeoutMs: number };

interface SquareGateway {
  getMerchant(merchantId: string, context: GatewayContext): Promise<MerchantSnapshot>;
  getLocations(context: GatewayContext): Promise<LocationSnapshot[]>;
  searchCatalog(query: CatalogQuery, context: GatewayContext): Promise<Page<CatalogSnapshot>>;
  searchOrders(query: OrderQuery, context: GatewayContext): Promise<Page<OrderSnapshot>>;
  retrieveOrders(query: { locationId: string; orderIds: string[] }, context: GatewayContext): Promise<OrderSnapshot[]>;
  listPayments(query: FinancialQuery, context: GatewayContext): Promise<Page<PaymentSnapshot>>;
  getPayment(paymentId: string, context: GatewayContext): Promise<PaymentSnapshot>;
  listRefunds(query: FinancialQuery, context: GatewayContext): Promise<Page<RefundSnapshot>>;
  getRefund(refundId: string, context: GatewayContext): Promise<RefundSnapshot>;
}
```

Queries, persisted verbatim with a hash:

- `CatalogQuery`: `{ beginTime?: Instant, cursor?: Cursor, limit: 100, objectTypes: ['ITEM','ITEM_VARIATION','MODIFIER_LIST','MODIFIER','CATEGORY','MEASUREMENT_UNIT'], includeDeletedObjects: true }`. Normalizer flattens nested objects once by ID/version. Keep explicit types when upgrading. Incremental start is previous completed watermark minus 15 minutes; `begin_time` is exclusive, so never advance to a maximum object timestamp without overlap. Completion watermark is captured request-window start time, not a beta `latest_time` assumption.
- `OrderQuery`: `{ locationId, axis: 'CREATED_AT'|'UPDATED_AT'|'CLOSED_AT', window, states?: [...], cursor?, limit: 100, returnEntries: false }`. Match sort axis to timestamp filter, `ASC`. Incremental `UPDATED_AT` searches omit state filter to see canceled and reopened source records. Closed-at report reconciliation supplies `COMPLETED`/`CANCELED`. Never combine a recent created-at range with incremental updated-at range.
- `FinancialQuery`: `{ locationId, createdWindow, updatedWindow?: Window, sortField: 'CREATED_AT'|'UPDATED_AT', sortOrder: 'ASC', cursor?, limit: 100 }`. Financial polls explicitly include broad creation bounds and update bounds; do not inherit Square's default one-year creation window. See section 4.

| Gateway call | Square request allowlist | OAuth read permission if later used |
|---|---|---|
| getMerchant | `GET /v2/merchants/{merchant_id}` | MERCHANT_PROFILE_READ |
| getLocations | `GET /v2/locations` | MERCHANT_PROFILE_READ |
| searchCatalog | `POST /v2/catalog/search` | ITEMS_READ |
| searchOrders | `POST /v2/orders/search` | ORDERS_READ |
| retrieveOrders | `POST /v2/orders/batch-retrieve` (conservative batches of 50) | ORDERS_READ |
| listPayments / getPayment | `GET /v2/payments`, `GET /v2/payments/{payment_id}` | PAYMENTS_READ |
| listRefunds / getRefund | `GET /v2/refunds`, `GET /v2/refunds/{refund_id}` | PAYMENTS_READ |

POST search/batch-retrieve operations are reads. All other outgoing paths/methods fail closed in v1. Credential tests, workers, and fake adapter run against this same surface. [SearchOrders](https://developer.squareup.com/reference/square/orders-api/search-orders), [SearchCatalogObjects](https://developer.squareup.com/reference/square/catalog-api/search-catalog-objects), [Locations](https://developer.squareup.com/docs/locations-api), [GetPayment](https://developer.squareup.com/reference/square/payments-api/get-payment), and [GetPaymentRefund](https://developer.squareup.com/reference/square/refunds-api/get-payment-refund) define the source contracts. Confirm batch/merchant SDK calls with the pinned generated types during the gateway implementation task before live access; do not switch to unreviewed endpoints if reference rendering changes.

All normalized snapshots include `squareId`, external location where applicable, source `createdAt/updatedAt`, safe canonical payload hash, and an allowlisted snapshot. Orders/catalog include numeric version represented losslessly as integer string/BigInt. Payments include status, order ID if present, source type, amount/tip/total/refunded totals, currency, opaque version token, and offline client timestamp if provided. Refunds include status, payment/order IDs if present, amount, currency, created/updated timestamps. Orders include own sale lines, line UID, variation ID, modifiers, Decimal quantity, subtotal/discount/tax/total snapshots, source state, closed time, return references and source-line links. Never copy card details, fingerprints, tokens, buyer contact, freeform payment notes, or full raw webhooks into diagnostics.

Use BigInt/integer strings at SDK/JSON boundaries and PostgreSQL BigInt cents; calculate quantities with Decimal. Reject unsupported currency into an exception without corrupting the stream. Preserve unknown enums and flag them for review; do not silently map them to completed, zero, or deleted. Normalization failures retain a redacted record of external ID, job, payload hash, and field reason; retries/dead-lettering are visible.

## 4. Durable synchronization

### Cadence and scope

Initial history is **90 days**, divided into local business-day windows converted to UTC. Import catalog first, then orders, payments, and refunds; later recipe creation must not fabricate historical recipe knowledge. Backfill is resumable and bounded per job. Persist configured history start and actual completed coverage; older references fetched by ID do not imply full older coverage.

Every **15 minutes**, schedule updated-at order/payment/refund scans from each stream's last completed watermark minus **15 minutes** to a fixed run upper bound. Schedule catalog changes on the same cadence and on catalog events. Every night, reconcile the preceding **7 business days**, including refunds created/updated now against older sales. Every week, replay the preceding **90 days** in day chunks. Owner `Sync now` enqueues work; it does not wait for the backfill in an HTTP request. Manual wider backfill accepts an explicit bounded range and records operator/reason.

For financial updated-at requests, set `createdWindow.from` to a fixed broad baseline (`1970-01-01T00:00:00Z`) and `createdWindow.to` to the immutable run upper bound; set `updatedWindow` to the incremental window and sort by `UPDATED_AT`. The [payment reference](https://developer.squareup.com/reference/square/payments/ListPayments) and [refund reference](https://developer.squareup.com/reference/square/refunds-api/list-payment-refunds) expose updated-at fields. SDK serialization, broad bounds, inclusive/exclusive details, and combined filters require sandbox verification. If broad bounds are rejected, use the earliest verified merchant history timestamp and record it as coverage. If updated-at filtering is unavailable or fails verification, release with the documented fallback: created-at overlap scans plus nightly/weekly full covered-window scans and direct `getPayment/getRefund` polling of every retained nonterminal record regardless of creation age. Surface the fallback and reduced change-detection coverage; do not claim unbounded historical completeness. Nonterminal direct-refetch runs at least every 15 minutes until terminal or escalated for manual review; old entries are not silently dropped after a retry count.

SearchOrders supports up to 1,000 rows per page, but this app uses 100 to bound work. Payment/refund pages have a maximum of 100. Follow cursor even when a page is short/empty; finish only on absent cursor. Preserve the complete original query for later pages, with only cursor changing. Search time filters are ANDed; use the [search rules](https://developer.squareup.com/docs/orders-api/manage-orders/search-orders) when mapping internal queries. Upserts tolerate source boundary inclusivity and overlap; timestamps are discovery aids, never unique keys.

### Claim, process, checkpoint

Use PostgreSQL job rows, not in-memory queues or fire-and-forget promises. The web app and worker share the same repository, modules, migrations, and database. A separate long-running worker process is an execution mode of the monolith, not a microservice. A scheduler only inserts deduplicated jobs. A bounded authenticated scheduler endpoint may trigger one short batch on a suitable host; deployment must provide durable processing independent of one Vercel request.

1. Insert job with dedupe key, query/window hash, connection/location, `available_at`, attempt count and cursor. Recurring ticks coalesce already-active work for that stream/window.
2. Claim due jobs using `FOR UPDATE SKIP LOCKED`; assign random lease owner, lease expiry, incrementing fencing token. Claim transaction commits before Square HTTP calls.
3. Fetch one page outside the transaction with timeout. Never hold inventory, reservation, or projection locks during network I/O.
4. Begin transaction; confirm current lease owner/token; acquire location projection advisory lock; validate resource identity; upsert newer snapshots, enqueue durable `REBUILD_SALE_PROJECTION` work for changed sale revisions, add audit/exception records, and persist cursor plus successor work atomically. A stale fenced worker discards its fetched result. The downstream projection transaction selects the latest canonical source, appends inventory/cost differences, and marks its applied revision atomically; stale intermediate jobs converge to that same latest revision.
5. On final page atomically mark run complete and advance that stream's watermark to fixed window upper bound. A failed intermediate page never advances completed coverage. Release lease or queue continuation.

Use a 120-second lease, renewal every 30 seconds, 20-second per-request timeout within a 45-second total network budget, and a batch budget below the execution host deadline. If any batch might exceed its lease, renew before processing; failing renewal aborts commit. Infrastructure values may change through a documented configuration change without changing these invariants. Source/projection commits use a per-connection/location advisory transaction lock. Inventory writes lock affected ingredients in UUID order; order is location integration lock, then source/order row, then ingredient rows. Counts, receipts, and corrections use the same ordered ingredient locks; see DATABASE for the authoritative inventory lock routine.

Retry network/429/5xx with exponential full jitter, base 2 seconds, cap 15 minutes, honoring valid `Retry-After`. Allow at most 8 automatic attempts per failing page; then mark job `DEAD`, keep watermark unchanged, alert, and expose retry. Long retry delay is `available_at`, not worker sleep. Sanitize error/request IDs. Respect concurrency of one projection transaction per location and bounded Square fetch concurrency; do not invent a universal Square requests-per-second entitlement. On expired cursor restart the same immutable window, preserving successful upserts. On 404 resource retrieval, retry eventual consistency and create a missing-source exception; never infer a sale deletion from one failed lookup.

### Source version guard

Unique order/catalog identity is `(connection_id, square_id)`; line identity is `(square_order_id, line_uid)`. Compare numeric source version inside the lock: older is ignored; equal plus equal hash is no-op; equal plus different hash triggers canonical refetch and an exception rather than overwrite. Newer version replaces the current normalized snapshot and recomputes its desired projection. Preserve prior projection/cost snapshots for audit.

Payments/refunds do not have an ordered numeric version contract. Compare updated timestamp and hash; never sort opaque payment version tokens. Equal timestamp/different hash or apparent terminal regression triggers single-resource refetch under a serialized dirty-resource job. Retain suspect data and exception, and do not apply uncertain financial changes until canonical resolution. Overlapping webhook/poll runs use the same import service and locks.

## 5. Webhook inbox

Configure independent sandbox/production HTTPS subscriptions manually in Developer Console at the pinned API version. Required event set: `catalog.version.updated`, `order.updated`, `payment.created`, `payment.updated`, `refund.created`, `refund.updated`. `order.created` may be subscribed for API-originated orders, but has no completeness role. Full event availability is verified at setup; record subscription ID/version and test result without storing signature key in SQL. [Catalog event](https://developer.squareup.com/reference/square/webhooks/catalog.version.updated) and resource webhook references provide the names.

`POST /api/webhooks/square` uses Node runtime and reads body bytes once with a 1 MiB limit before parsing. Verify HMAC-SHA256 with the configured exact public callback URL and subscription signature key against `x-square-hmacsha256-signature`; constant-time compare decoded equal-length signatures. Do not derive signed URL from untrusted Host/Forwarded headers, JSON reserialization, request path alone, or development URL guesses. Validate before parsing/trusting merchant IDs. Follow [Square validation](https://developer.squareup.com/docs/webhooks/step3validate).

For valid signatures: parse minimal allowlisted envelope, match merchant/environment to configured connection, and insert inbox event unique `(connection_id,event_id)` plus dirty-resource/catalog job in one database transaction. Store only event ID/type, resource IDs, version hints, created/received time, body hash, processing state and sanitized error. Return `200` once durable; a duplicate also returns `200`. If persistence fails return `503`, allowing Square retry. Invalid signature or JSON/schema returns `400`; oversize returns `413`. Signed irrelevant/unknown event types for the known connection are recorded as ignored using sanitized metadata and acknowledged. An unknown merchant/application or mismatched environment is rejected with generic `400`, never attached to a default tenant. Do not reveal connection existence in response bodies.

Target acknowledgement below 2 seconds, always within Square's 10-second requirement. Square retries for up to 24 hours and does not guarantee ordering; see [webhook delivery](https://developer.squareup.com/docs/webhooks/overview). Do not reject old valid event timestamps as a replay defense: legitimate delayed retries exist, and durable event-ID dedupe handles replay. The worker refetches canonical resources; event bodies never directly debit inventory or recognize money. A verified `payment.updated` or `refund.updated` may enqueue referenced orders and linked original sales. Incomplete links remain exceptions until resolved. Webhook retention expiry is safe because resource upserts and projections are independently idempotent.

## 6. Revenue, refunds, and ingredient projections

### Order recognition

Import all source states for discovery/corrections. Recognize an order's **own sale lines** only when state is `COMPLETED` with a valid `closed_at`; missing close time is an exception, not a silently invented order date. Bind the first accepted close time as inventory `sale_effective_at`. A later different authoritative close time creates `TIME_CORRECTION_REQUIRES_REVIEW` and blocks automatic reprojection rather than moving usage across count anchors. Owner preview/execute must explicitly reverse old-effective-date usage and replace it at the new date, showing the count-covered versus current-stock effects; do not collapse those two timestamped entries to a net-zero quantity. `OPEN`, `DRAFT`, and `CANCELED` otherwise have desired sale projection zero. A later canceled/reopened order reverses previous theoretical usage and sale projection through an appended correction at its fixed effective time. Completed exchange orders contribute only their own new sale lines; their returns link to older originals and never create another copy of those original sale lines.

Recognize own line revenue excluding allocated tax and tips, after Square line discounts; preserve service/other amounts separately. Use Square-calculated amounts rather than current catalog prices. Ad-hoc lines remain imported and unmapped. Gift-card purchases, service charges, tax, and tips do not masquerade as dish revenue; classify known source fields, otherwise put money in an explicit unknown/other bucket. Unsupported/ambiguous item classification creates an exception. Store original UTC order, payment, and refund timestamps separately; restaurant business days follow configured timezone/cutoff. Offline order-created time may mean server receipt, so do not call it device time or infer an earlier sale date from a later payment without verified evidence.

### Refund recognition and allocations

Import every refund status. Only a canonical `COMPLETED` PaymentRefund changes collections/refund totals. The reporting convention assigns its adjustment to source refund `created_at` once status becomes COMPLETED; that later transition can revise the earlier period. Preserve `updated_at` and first-observed completion time separately for provenance, not as a silently substituted refund reporting day. This convention is not a claim about bank settlement date. If an authoritative correction changes terminal status, revise the projection with audit.

PaymentRefund is the sole money-refund source. `Order.returns`, `return_amounts`, `net_amounts`, `Order.refunds`, and `Payment.refunded_money` are linkage/reconciliation evidence, not additional deductions. A custom refund does not identify a dish. Official [return/exchange semantics](https://developer.squareup.com/docs/orders-api/order-returns-exchanges) show separate return orders and explain itemized versus custom amount. Persist return-order/source-order/source-line links and refund IDs; never equate every refund `order_id` with the original sale ID.

Allocate each completed refund amount exactly once among integer-cent buckets `menu`, `tax`, `tip`, `service`, `other`; optionally assign menu cents to original sale line IDs. Automatic allocation is allowed only when canonical return details unambiguously match the completed refund and sum exactly. A return order containing multiple refunds, mixed exchange/payment movements, missing source history, or CUSTOM_AMOUNT without clear split remains `PENDING_ALLOCATION`. Do not proportionally guess tax/tip or silently put all custom refunds into menu revenue. A manager/owner supplies an audited allocation with reason and expected revision. Require nonnegative bucket amounts summing to refund amount, linked source existence before line allocation, and cumulative allocated refund bounds unless an explicit reviewed exception documents source inconsistency. New contradictory Square evidence marks prior allocation `NEEDS_REVIEW`; retain its history.

While any completed refund relevant to a reporting scope lacks an accepted allocation, return known collections/refund totals but **net menu sales and dependent margin as `null`/provisional**, with known menu adjustments and unresolved cents shown separately. Never publish an apparently exact margin from incomplete refund attribution. Refunds are reported on their source-created business day once completed; an original-sale drilldown can show lifetime adjustments with clearly different date semantics.

### Usage idempotency and counts

Completed dish quantities select the published recipe version effective at sale `closed_at`, ingredient cost snapshots effective at that time, and modifier deltas. Missing recipe/cost is unknown, not zero. Persist line-level recipe/cost basis and projection hash; current catalog/recipe edits do not rewrite history. A deliberate historical mapping/reprojection is an owner job with range, reason, preview counts, preserved revisions, and the same delta routine.

Quantity completeness is a whole-line decision. If its base recipe or any selected modifier's ingredient effect is unknown, or configured expansion is negative, mark `QUANTITY_UNKNOWN` and do not post partial guessed ingredient usage. A newly imported unknown line has no consumption posting. If a previously applied line becomes unknown, retain its last known desired consumption and label the projection stale/incomplete rather than reversing that consumption to zero. Once mapping is resolved, recompute the entire line and append only the difference from preserved state. Missing ingredient price alone does not make quantity unknown: known usage still posts, while cost remains partial/unknown. Explicit source cancellation or line removal reverses previously applied usage even if its recipe can no longer be resolved. These states are independent of a genuine known zero requirement.

Within the location lock compute desired ingredient quantity for every recognized sale, compare to its previous posted desired state, and append only the signed difference. A posting key includes projection ID, monotonically increasing local revision, and ingredient ID. Update projection, append ledger movements, and audit in the same transaction. Do not key stock consumption on webhook event ID: polling and a second event must produce no extra debit. Include removals of old ingredients/modifiers when an order changes; iterating only new lines would leak old usage. Rounding is deterministic Decimal to database scale once per ingredient projection.

A financial-only full/partial refund never puts prepared ingredients back in stock. Gross prepared quantity and financially returned quantity are separate measures. Only a sale content/state correction or explicit audited manager stock correction changes theoretical consumption; returns themselves do not prove ingredients are reusable. Prevent double waste: disposal already represented by sale usage is not entered again as an unrelated ingredient loss without an explicit compensating reason.

Ledger retains all sale usage at original effective sale time and its later correction revisions. Current estimated balance is **latest posted count actual + sum of non-count movements with `effective_at > count.counted_at`**; without a count, it is all non-count movements from zero opening balance. `COUNT_ADJUSTMENT` documents variance but is excluded from this calculation because the actual count is already the anchor. Thus a late pre-count sale remains in usage history but is already covered by that count and does not lower current stock twice. Corrections to a pre-count sale use that same original effective time. Manual receipts/waste/corrections are effective at posting time and cannot be backdated in v1. Count posting and inventory writes use the same ordered ingredient locks. See DATABASE for the exact count-cutoff and concurrency transaction.

## 7. Reconciliation and reporting confidence

Run reconciliation from stored canonical snapshots after each bounded window, then nightly. Upsert exceptions by stable `(connection,location,type,source_identity)` rather than creating a new alert every run. States are open, investigating, resolved, or acknowledged-with-reason; acknowledging does not change Square source values. Reopening on new contradictory evidence preserves history.

Checks:

1. Every processed order/catalog resource has one current replica at the greatest accepted version; each order line UID is unique within its order.
2. Every completed payment contributes `amount_money + tip_money` once; every completed refund contributes amount once. `collections_net = sum(completed payment amount + tip) - sum(completed refund amount)`. The official Payment object defines `amount_money` as excluding tip and `total_money` as including it; store source total as a cross-check and raise an exception if it differs. Never add tip a second time to total. Show source type, currency, reporting time, and unmatched amounts.
3. For a single linked order, compare completed-payment totals with its expected Square total including tax/tip/service and explicit rounding. Report split tender, pending payment, exchange, return, cash/external, missing source, and timing differences; do not force them to zero by editing imported data.
4. Refund allocation buckets sum exactly to each accepted refund amount. Aggregate `net_menu_sales = recognized own menu sale revenue - accepted menu-refund allocations`, only when allocation coverage is complete. Tax/tips/service/other stay separate. Do not sum Square order net totals and subtract refund totals again.
5. A payment without an imported order remains a payment with an orphan exception and a refetch job. A refund without payment/original order remains a refund and allocation exception. Fetch known referenced IDs outside initial history; retain partial-history flags. Do not discard financially real orphan activity or invent dish quantities from money.
6. Target usage per order/ingredient equals net ledger postings across its revisions. Replaying identical canonical inputs creates zero new postings, allocations, or sales.
7. Physical estimated balance is recomputed from count anchor plus later effective movements, not from cumulative usage minus an independently summed count adjustment.

Dashboard health includes last successful time **per stream**, complete coverage ranges, pending/dead job counts, oldest unprocessed event, unallocated refund cents, unmapped sales coverage, last reconciliation result, and last provider failure. Track ingestion and downstream projection completion separately; a page checkpoint with dead projection jobs does not make reports fresh. A new catalog sync does not make old sales fresh. At 30 minutes since expected successful poll show stale warning; at 2 hours show critical status. Display last known data during outages; never replace unavailable totals with zero. Coverage/freshness thresholds and alerts are app policy, not a Square SLA.

## 8. Recovery and operational procedures

| Incident | Required recovery |
|---|---|
| Token revoked/401 | Mark REAUTH_REQUIRED; stop repeated unauthorized jobs; retain data/queue. Operator rotates provisioned secret, owner tests identity, then resumes existing connection and replays from last complete watermark minus overlap. |
| 429 or provider outage | Backoff scheduled jobs, bound concurrency, show stale time, notify on threshold. Resume same windows; no manual balance edit. |
| Job lease expired/crash | Another worker claims with new fencing token; former worker cannot commit. Restart page with same query/cursor; unique guards prevent duplicate effects. |
| Dead/poison page | Owner inspects redacted field/error and source identity, fixes normalizer/config if needed, and retries same job/window. Do not skip source rows to mark sync green. |
| Invalid cursor | Restart same fixed window from first page. Existing snapshots/projections make this safe. |
| Lost webhooks/downtime beyond 24h | Poll updated-at streams, point-refetch retained nonterminal IDs, run nightly/weekly or manual wider reconciliation; do not assume Square replays expired delivery. |
| Incorrect recipe mapping/projection | Preserve source and ledger; preview historical impact, authorize dated replay, append differences and audit. Do not truncate ledger/import tables. |
| Database restore | Restore to isolated instance; disable workers/scheduler/webhook writes; verify schema/checksums/history; invalidate stale leases; reset unfinished jobs; reconcile from restore watermark minus overlap and wider outage range. Recompute projections with idempotent deltas, not bulk blind reinsertion. Confirm reservations and count anchors before cutover. |
| RestaurantOS unavailable | Square continues taking payments and managing checks. Host uses previously exported reservation roster with controlled handling; staff records receipts/waste for later audited entry at posting time. |
| Merchant/location mismatch | Disable connection and stop projections; preserve replicas in their original scope. Configure distinct connection and reconcile before exposing data. |

Audit owner manual sync/replay, connection enable/disable/test, credential reference rotation, allocation corrections, exception acknowledgement, and historical reprojection. Logs contain correlation/job/source IDs and sanitized errors; no credentials or unnecessary diner/payment PII. Restore drill, token rotation drill, retry drill, and alert routing evidence are release requirements. Retention and backup policy are defined in ARCHITECTURE/PRD; expiring inbox metadata must never delete imported financial history.

## 9. Implementation acceptance fixtures

The fake gateway must provide paginated and overlapping windows, identical repeated results, older/newer/same-version changes, out-of-order events, 429/5xx, expired cursors, delayed offline order arrival, currency/enum errors, missing references, and legitimate zero values. Tests run against real PostgreSQL constraints and workers where races matter.

Minimum deterministic examples:

- Import a completed order with two identical variation lines but different UIDs. Reimport through polling and two event IDs: one sale, two lines, unchanged net usage.
- Change quantity 2 to 1, change recipe ingredient, remove a modifier, then cancel. Each revision appends only differences; canceled order net usage is zero. Repeat/reorder older imports without new effect.
- Complete a payment of 3,300 cents including 300 tax and 200 tip for 2,800 menu cents. Complete a 1,100-cent refund allocated 900 menu/100 tax/100 tip. Collections are 2,200; net menu is 1,900; prepared usage remains unchanged. A missing allocation yields known 2,200 collections and null final net menu.
- Return order for an old sale plus new exchange sale lines: recognize only own new completed sale lines; no duplication of originals; one financial deduction per refund ID.
- A count of 10 kg at cutoff T followed by 1 kg sale at T+1 and late-arriving 2 kg sale at T-1 leaves current estimate 9 kg, while usage history contains all 3 kg. Replaying the late sale leaves 9 kg.
- Pending refund created before initial backfill start later completes: direct retrieval/verified updated-at query catches it and updates one financial projection.
- Two workers and a lease-expired worker process the same source. Only the current fenced transaction commits; no duplicate posting or checkpoint advancement.

## 10. Evidence gates before production

Record fixture IDs, merchant plan/device configuration, pinned versions, source IDs, timestamps, expected/actual results, and redacted screenshots/logs in a dated integration-verification artifact. An unrun gate is explicitly pending, not silently accepted.

| Gate | Environment | Required evidence |
|---|---|---|
| SQ-V1 | Fake + PostgreSQL | Complete duplication, rollback, lease/fencing, pagination, delta, and reconciliation suite. |
| SQ-V2 | Sandbox | Merchant/location verification, allowed read methods, SDK serialization, broad created bounds + updated-at filtering, cursor continuation, catalog tombstones/nested objects. |
| SQ-V3 | Sandbox | Signed/forged/raw-body/url webhook cases; payment/refund transition reads and source-return-order links; fallback path if unsupported behavior. |
| SQ-V4 | Intended Free configuration/device | Read access to actual completed POS card/cash/split-tender/discount/modifier orders; catalog IDs, tips/tax/rounding, event coverage, controlled refund. No unsupported POS mutations by RestaurantOS. |
| SQ-V5 | Intended Plus configuration/device | Same contract evidence; document payload differences and verify no paid feature dependency. |
| SQ-V6 | Actual supported device | Offline late arrival, created/closed/payment timestamp provenance, source event behavior; if operationally unavailable, keep launch gate pending and do not claim it verified. |
| SQ-V7 | Production-like infrastructure | Rotate token, expire lease, replay dead page, restore backup, poll after webhook gap >24h, verify alerts, verify stale UI. |

Controlled device tests are separate from automated CI and require the operator's own credentials/account/device and approval of any minimal live transaction. Sandbox API-created orders do not prove POS-created event behavior. Refund processing may be asynchronous; no app action should try to force native order/refund state just to make the test pass. If a gate reveals a source limitation, retain the exception/fallback honestly and revise acceptance scope before launch.

## 11. Primary references

All source claims above are based on official Square documentation or Square's own SDK repository, reviewed November 4, 2026. These links are research evidence, not proof that this restaurant account was exercised.

- [SDK 46.0.0 release and API pairing](https://github.com/square/square-nodejs-sdk/releases/tag/46.0.0)
- [Node SDK and rewrite guidance](https://developer.squareup.com/docs/sdks/nodejs)
- [Personal and OAuth access tokens](https://developer.squareup.com/docs/build-basics/access-tokens)
- [OAuth scopes](https://developer.squareup.com/docs/oauth-api/square-permissions)
- [OAuth code/PKCE flow lifecycle](https://developer.squareup.com/docs/oauth-api/overview)
- [Locations and permissions](https://developer.squareup.com/docs/locations-api)
- [Orders visibility and POS source behavior](https://developer.squareup.com/docs/orders-api/what-it-does)
- [SearchOrders reference](https://developer.squareup.com/reference/square/orders-api/search-orders)
- [SearchOrders time/filter rules](https://developer.squareup.com/docs/orders-api/manage-orders/search-orders)
- [Catalog search including tombstones](https://developer.squareup.com/reference/square/catalog-api/search-catalog-objects)
- [Catalog version webhook](https://developer.squareup.com/reference/square/webhooks/catalog.version.updated)
- [POS-excluding order.created reference](https://developer.squareup.com/reference/square/webhooks/order.created)
- [order.updated reference](https://developer.squareup.com/reference/square/webhooks/order.updated)
- [Payments list and updated-at filters](https://developer.squareup.com/reference/square/payments/ListPayments)
- [Single payment retrieval](https://developer.squareup.com/reference/square/payments-api/get-payment)
- [Payment statuses and fields](https://developer.squareup.com/reference/square/objects/Payment)
- [Refund list and updated-at filters](https://developer.squareup.com/reference/square/refunds-api/list-payment-refunds)
- [Single refund retrieval](https://developer.squareup.com/reference/square/refunds-api/get-payment-refund)
- [Refund statuses and fields](https://developer.squareup.com/reference/square/objects/PaymentRefund)
- [Return orders, custom refunds, exchanges](https://developer.squareup.com/docs/orders-api/order-returns-exchanges)
- [Webhook retry, duplicate, ordering, and acknowledgement rules](https://developer.squareup.com/docs/webhooks/overview)
- [Raw-body signature validation](https://developer.squareup.com/docs/webhooks/step3validate)
