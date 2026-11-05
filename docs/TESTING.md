# Testing and release verification

Planning baseline: November 4, 2026. Tests must demonstrate business integrity, including failure/retry/concurrency behavior. A screenshot or successful HTTP response alone does not establish correct inventory, revenue, or booking allocation. This document specifies work to implement later; no test suite, Square exercise, browser review, or recovery drill is claimed to have run during planning.

## Test structure and execution

Use Vitest for pure and service tests, a real PostgreSQL 17 test database for persistence/concurrency/migrations, and Playwright for browser journeys. Never substitute SQLite or mocked Prisma calls for exclusion constraints, transactions, numeric precision, or uniqueness verification. Keep one local Docker Compose database and isolated databases/schemas per parallel test worker. Never point automated tests at a production database or use production Square credentials.

| Layer | Location | What it proves |
| --- | --- | --- |
| Pure unit | `tests/unit/{money,units,time,recipes,reporting,square}` | Decimal rules, allocation, state machines, normalized calculations, retry classification. No DB/network. |
| Services + DB | `tests/integration/{auth,sync,inventory,purchasing,recipes,reservations,reporting,jobs}` | Transactions, uniqueness, tenant scope, audit and idempotency, actual locking and rollback. |
| HTTP contracts | `tests/contracts/{api,square,webhooks}` | Shared Zod schemas, JSON serialization, status/error envelopes, raw-body HMAC, secret-free responses. |
| Browser | `tests/e2e/{owner,inventory,host,public,rbac}` | Main user journeys, role navigation, accessibility, keyboard/mobile use, visible unknown/stale states. |
| Live Square | `tests/manual/square-verification.md` plus sanitized evidence | Actual supported API behavior, sandbox limitations, POS-originated payload/event behavior on target plans/devices. Opt-in, separately run. |
| Operations | `tests/operations/{restore,replay,migrations}` and runbook evidence | Fresh install, compatible upgrade, crash/retry recovery, backup restore and replay. |

Foundation tasks establish stable package scripts: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:contracts`, `npm run test:e2e`, and `npm run build`. `npm run test` composes unit/integration/contracts; browser tests are explicit. CI uses `npm ci`, then migrate the isolated test database from empty, then all required checks. Do not silently skip DB/browser suites when a service is unavailable; fail with a clear setup error. CI reports exact commands, exit codes, and failed test artifacts.

PR checks: typecheck, lint, unit/integration/contracts, production build and critical Chromium E2E. Before each phase gate and production release: full E2E on Chromium plus public/host smoke on WebKit, accessibility and responsive checks, migration smoke, secret/dependency scan. Scheduled or release-only restore drills are meaningful operations checks, not a substitute for PR tests. Use lockfile-pinned tools. Run built-artifact browser verification with NODE_ENV=production and APP_ENV=test/staging; only APP_ENV=production is the live deployment security boundary and must reject fake/capture/demo modes. The official Taste inspector has a fresh browser profile without an auth-state import; inspect public booking there and verify protected routes through authenticated Playwright screenshots and documented app critique, never a login redirect. Coverage is a diagnostic: require every listed invariant and branch case; avoid a percentage target that encourages implementation-mirroring tests.

## Shared fixtures and deterministic helpers

- `tests/fixtures/tenancy.ts`: two restaurants, two locations within restaurant A, identical-looking records across tenants, every role, disabled member, missing location grant, two owners. Single-location v1 UI does not remove these security fixtures.
- `tests/fixtures/square/`: source JSON fixtures from fake/sanitized documented shapes: catalog pages/tombstones, completed/open/canceled orders, custom lines, decimal quantities, modifiers, line discount/tax allocations, split tenders, payment status transitions, partial/full refunds, exchange/return orders, missing links, mixed currency rejection, and offline late arrivals. Store provenance/API version and redact card/customer fields.
- `tests/fixtures/costing.ts`: reproducible recipe/receipt/cost basis with known, missing, partial and explicit zero cost; prior and later recipe versions and modifier deltas.
- `tests/fixtures/reservations.ts`: explicitly approved single/combined tables, opening hours crossing midnight, blocks, buffered bookings, daylight-saving cases and disabled public booking.
- Inject a clock, UUID generator where stable identities matter, Square gateway and randomness for retry jitter. Use real timer control only around polling; never replace database time when testing lease safety.
- A concurrency helper opens independent database connections and uses barriers so transactions overlap deliberately. `Promise.all` without a barrier is insufficient evidence of a race test. Assert committed DB rows, ledger sums, status, audit, and response, not only return values.
- Compare authoritative desired-state hashes and sorted projections after replay. Property-based cases can exercise arbitrary duplicates/orderings; failure output records a reproducible seed.

## Golden accounting and stock fixture

Use exact decimal strings throughout this fixture. Ingredient flour has a receipt of `1000.000000 g` costing `800` cents, establishing `0.8` cents/g. A published recipe uses `250 g` per batch, yields `2` portions and has loss fraction `0.2`. Required flour per portion is `250 / 2 / (1 - 0.2) = 156.25 g`; one portion costs `125` cents.

1. Receive the ingredient once: current estimated stock `1000 g`. Retrying receipt POST with the same key, a new key for the same posted receipt, and a worker retry yields exactly one `+1000 g` movement and one cost-history basis.
2. Import completed sale of three portions: usage `468.75 g`, cost `375` cents, balance `531.25 g`. Import/replay the same version any number of times: no added movement or changed cost snapshot.
3. Record `31.25 g` waste: balance `500 g`. Count actual `480 g`: expected `500`, variance `-20`, authoritative anchor actual `480`. The count variance trace is separate from post-anchor summation.
4. Import a previously unseen one-portion sale with sale time before/equal to count cutoff: historical theoretical usage includes `156.25 g`; current balance stays `480 g`. Correct that old sale later: revised historical usage changes; current balance still stays `480 g`.
5. Import a two-portion sale with sale time strictly after the anchor: subtract `312.5 g`, balance `167.5 g`. A correction from two portions to one posts only a `+156.25 g` theoretical delta, balance `323.75 g`.
6. Complete a money refund on the original three-portion sale: revenue changes; stock and original ingredient consumption do not automatically increase. An explicitly reasoned physical restock posts a separate manual adjustment at current server time.

Golden revenue fixture: gross menu `1000` cents, menu discounts `100`, menu net before refund `900`, tax `90`, tip `180`, service charge `0`, completed payments `1170`. A completed refund of `390` with verified allocation menu `300`, tax `30`, tip `60` produces net menu `600`, retained tax `60`, retained tip `120`, and net payment collections `780`. The reconciliation identity is `600 + 60 + 120 = 780`. An unallocated refund must make net-menu reporting provisional/unknown according to the API, never assume all `390` is menu revenue. Pending/failed refunds contribute no recognized refund. Re-importing the linked return order and payment refund does not subtract the money twice.

## Unit requirements

| ID | Cases and expected behavior |
| --- | --- |
| U-MONEY | BigInt serialization; dedicated Decimal helper with 50 significant digits/HALF_UP; positive/negative ties rounded away from zero; no binary-float intermediates; sum allocation residuals deterministically; derived quantity/rate/money out-of-storage/API-bounds rejects 422 before writes; USD-only validation; null vs explicit zero. |
| U-UNITS | kg↔g, L↔ml, count/fraction, packs with decimal base quantity, zero/negative pack size rejected, excessive precision rejected; incompatible mass/volume rejected; no inferred density. |
| U-RECIPE | Batch yield/loss formula; loss zero and near one; yield zero rejected; signed modifier adjustments; multiple modifiers/quantities; nonnegative final demand; unmapped variation vs modifier; no recursion; expired/past/future mappings; zero-cost vs unknown basis. Coalesce per-line/ingredient before one six-place half-up quantization; delta between quantized desired states, not independently rounded changes. |
| U-QUANTITY-UNKNOWN | Missing base/unknown selected modifier/negative requirement yields whole-line QUANTITY_UNKNOWN, no guessed base-only stock effect; missing ingredient cost alone leaves quantities known. Last known state is preserved until mapping resolution; explicit cancellation/removal can reverse it. |
| U-COST-TIME | Last eligible received/opening cost at sale instant, no future cost leakage; deterministic same-time tie; receipt reversal makes basis ineligible for future quotes; published historic snapshots unchanged without explicit replay. |
| U-TIME | UTC storage and local display; business cutoff before/at/after 03:00; 23/25-hour days; exclusive date interval converted using local zone; nonexistent spring time rejected, repeated fall time requires unambiguous offset; no 24-hour millisecond arithmetic for calendar days. |
| U-SOURCE | Strict status normalization; unknown Square enums quarantined visibly, not treated as completed; Square IDs through 255 characters, too-long IDs and decimal versions; sanitized field allowlist; no customer/card payload propagation. |
| U-REVENUE | Line discounts, tax/tip exclusion, service charges separate, ad hoc lines, explicit source item returns, exchange sale lines, split payments, completed refund allocation, no double refund; unresolved split suppresses exact menu-net claim. |
| U-REPORT | Partial mapping coverage, unknown cost propagation, no divide by zero/negative net denominator, contribution margin excludes tax/tips and does not claim net profit, business date vs payment/refund date. |
| U-STATE | PO, receipt, reservation, waitlist, sync/job status transitions; no silent invalid transition; canceled/no-show capacity release; refund alone not a stock reversal. |
| U-RETRY | HTTP 429/5xx/timeouts retry with capped exponential backoff+jitter; 401 disables/reauths; validation/403 terminal classification; honor available retry metadata; bounded attempts and dead-letter state. |

## Integration and concurrency requirements

### Authorization, tenancy, and persistence

| ID | Exercise | Required assertion |
| --- | --- | --- |
| I-AUTH-01 | Every operation against every role, unauthenticated/disabled/no-location users | Match PRD permission matrix; server enforcement independently of hidden UI. Read and mutation tested. |
| I-AUTH-02 | Replace ingredient/order/receipt/reservation/recipe IDs or location/restaurant filters with another tenant's IDs | Uniform not-found/forbidden contract; no foreign data, update or existence leak. Composite FK prevents fabricated child relation through direct DB insert. |
| I-AUTH-03 | Disable/revoke a membership while session remains valid | Next request denied; stale session role never grants access. |
| I-AUTH-OWNER | Two last-owner demotions/disable actions concurrently attempted | At least one active owner remains, with audit. |
| I-AUTH-04 | Login invitation/bootstrap and magic-link reuse/expiry | No arbitrary signup; single-use expiring links; generic email-enumeration-safe response; bootstrap cannot replace an existing owner. |
| I-CSRF-SESSION | Retrieve GET /api/v1/csrf without session, as active member, after logout/rotation; submit another session's token, missing token, wrong Origin or legacy null-token session | Only authenticated active member receives private/no-store synchronizer token; 32 random bytes session-bound, no token in logs. Staff writes require matching token plus same Origin; legacy null token forces reauthentication. Auth.js actions retain its supported CSRF protocol. |
| I-IDEM-01 | Simultaneous same operation/key/body; same key/different body; actor/tenant isolation | Exactly one commit; staff replay exact original status/body; changed body conflict; audit not duplicated. Public booking replay is documented current-status exception. Stored response has no secrets/guest PII leak. |
| I-IDEM-02 | Retry after idempotency retention expiration | Durable receipt/source/reservation operation identity still prevents repeat posting; no assumption short-lived HTTP cache is the business ledger. |
| I-AUDIT | Inject failure before/after business write or audit write | Whole transaction rolls back or whole transaction commits; no successful sensitive write without audit. Redaction verified by fixtures containing obvious canary secrets. |
| I-MIGRATE | Empty migrate, preceding-release upgrade, schema drift, restricted role | Every custom check/FK/exclusion survives; only release role migrates; app cannot edit/delete append-only financial history. |

### Square import, webhooks, jobs, and reconciliation

| ID | Exercise | Required assertion |
| --- | --- | --- |
| I-SYNC-01 | Multi-page catalog/orders/payments/refunds; empty page with cursor; repeated page | Complete pagination without missing/duplicate entity; bounded memory; completed watermark only after final durable page. |
| I-SYNC-02 | Duplicate/out-of-order source order/catalog versions; equal-version same/different hash | Lower version cannot overwrite newer; identical no-op; equal-version divergent data quarantined/reread, no random last-writer-wins. |
| I-SYNC-03 | Completed sale repeats, changes qty/modifiers, loses eligibility or is canceled; deleted line | Desired-state delta only; reversal preserves history; no consumption from unpaid/open order. Per-line UID identity handles removed and added lines. |
| I-SYNC-TIME | Authoritative source changes closed_at after first accepted sale, crossing a physical count boundary | First-bound consumption effective_at does not move automatically; TIME_CORRECTION_REQUIRES_REVIEW quarantines projection. Owner-approved timestamp replay emits old-effective reversal and new-effective desired movement, preserving anchor coverage; identical replay is a no-op. |
| I-SYNC-04 | Payment/refund arrives before order, missing link, split tenders, cash/external source, pending→completed | Nullable links repair later; completed status recognition; no guessed item lines from payment total. Unsupported/unknown cases become reconciliation issues. |
| I-SYNC-05 | Completed partial/full refund, refund state regression, return order with source line, exchange lines | Monetary refund once; no inferred restock; original consumption not doubled; exchange's actual new sales consumed once. |
| I-SYNC-06 | Offline late arrival 72+ hours, older-than-overlap correction, retained source created vs closed times | Nightly/manual wider reconciliation catches missing records; explicit uncertainty in timing; no fabricated device timestamp or real-time claim. |
| I-SYNC-07 | Overlapping scheduled/manual sync, killed worker after page commit but before cursor/ack | Lease fence prevents stale worker commit; rerun idempotent; no watermark loss, partial state shown honestly. |
| I-SYNC-08 | Square 429, 500, timeout, revoked credentials, unavailable API | Retry/dead-letter/reauth correctly, staff read local data with stale warning, no synchronous dashboard dependency on Square. |
| I-SYNC-09 | Incremental catalog updates/deletions/location visibility | Tombstone retained; active mapping warning; historical sale still resolvable; merchant catalog identity not duplicated per location. |
| I-WEBHOOK-01 | Official HMAC fixture, raw whitespace/body mutation, wrong exact callback URL/key, forged signature | Only correct raw-body signature accepted; reject before parsing/persisting; timing-safe verification. Never reconstruct JSON before validation. |
| I-WEBHOOK-02 | Duplicate event ID, reordered event, signed unknown event type, other merchant/environment | Safe duplicate acknowledgement; refetch jobs rather than payload balance mutation; unknown supported connection events recorded/ignored visibly; cross-merchant rejected/ignored per contract. |
| I-WEBHOOK-03 | DB outage while receiving; commit succeeds but response lost | No 2xx before inbox+job durable commit; redelivery produces one business effect. Response latency meets acknowledgement budget when healthy. |
| I-JOB-01 | Two workers claim one job; expired lease recovered; old worker resumes | At most one valid fenced commit; all checkpoint writes verify lease generation; retries do not duplicate inventory. |
| I-JOB-02 | Poison payload repeatedly fails, manual retry/replay, job dedupe | Terminal dead-letter after configured attempts; sanitized actionable issue; replay creates tracked run with stable business keys. |
| I-RECON | Known order/payment mismatch, unallocated refund, missing line/catalog, repeated reconciliation | Stable issue fingerprint; no duplicate issue flood; acknowledge does not alter totals; source resolution closes issue and shows freshness. |

### Purchasing, recipes, stock, and reports

| ID | Exercise | Required assertion |
| --- | --- | --- |
| I-RECEIPT-01 | Partial delivery in two receipts, repeated submit, simultaneous receiving | Actual delivered only; outstanding never negative; overdelivery rejected until PO amended; independent idempotency keys cannot repost one receipt. |
| I-RECEIPT-02 | Wrong ingredient/supplier/PO relation, archived package, changed conversion | Tenant/relation validation; line uses frozen conversion/cost, not current package edits; archived historical references remain readable. |
| I-RECEIPT-03 | Reverse posted receipt twice, replace receipt, stale editor | One opposite movement per original, immutable source, reason/audit; expected PO status restored correctly; no deleting history. |
| I-PURCHASE-DATES | Receive 800 cents on business day A, reverse on day B; reports A-only, B-only, A+B | A: gross 800/reversed 0/net 800; B: gross 0/reversed 800/net -800; A+B: gross 800/reversed 800/net 0. Original status REVERSED does not retrospectively erase day A; current PO quantity still nets original minus reversal. |
| I-STOCK-01 | Waste/adjustment/count/source deduction contend for same ingredient | Lock order avoids lost update; count baseline and variance derived from transaction-consistent state; no negative actual count. |
| I-STOCK-02 | Late pre-count sale, correction across count, replay recipe before/after anchor | Current stock follows latest actual anchor; pre/equal-cutoff movements don't rededuct; after-cutoff corrections affect only delta; theoretical reporting remains complete. |
| I-STOCK-03 | Multiple counts, counts not covering every ingredient, exact cutoff tie, negative balance | Anchor chosen per ingredient, not location-wide assumption; equality covered by count; no-count ingredient sums all; negative estimate visible. |
| I-STOCK-CLOCK | Count/receipt waits on ingredient lock, zero-variance count, equal server timestamps | Count cutoff assigned after locks through database clock; later operational movement timestamp exceeds anchor cutoff; zero-variance count creates anchor without a forbidden zero ledger movement. |
| I-RECIPE-01 | Concurrent publish, effective interval overlap, modifier mapping ambiguity | One unambiguous version/mapping at sale instant; DB range guard; draft doesn't affect sale; no retroactive silent change. |
| I-RECIPE-02 | Historic mapping repair/replay with later ingredient price | Explicit replay snapshot pins chosen historical basis; source input unchanged no duplication; audit old/new revisions; pre-count physical stock unchanged. |
| I-RECIPE-PARTIAL | New line missing base or selected modifier effect, existing applied line becomes unmapped, missing ingredient cost only | New QUANTITY_UNKNOWN line has no movements; existing last-known consumption remains with stale/incomplete quality and no fake reversal; known quantities with missing costs still post. Resolving mapping posts delta once; cancel/remove reverses known prior quantity despite missing mapping. |
| I-DECIMAL-POST | Recurring expansion: 1g batch/yield3, one→two→three sold; two coalesced modifier components; tiny qty generating overlarge rate | Desired quantities .333333→.666667→1.000000, deltas -.333333→-.333334→-.333333, total exactly -1g; coalescing precedes rounding; replay no new movement. Rate beyond Decimal(24,12) rejects 422 with no partial receipt/stock/cost/audit commit. |
| I-REPORT-01 | Golden fixture, unmapped/custom item, partial cost, refund allocation incomplete | Exact expected totals/coverage/nulls; no unknown shown as zero; sales/payment clocks distinguished; tax/tip separate. |
| I-REPORT-02 | CSV export role scope, formula injection values, large range | Authorized rows only, prefix dangerous spreadsheet formula text, stable decimal/date formatting, bounded size/pagination, no private guest data in owner financial export. |

### Reservations and waitlist

Use at least two actual concurrent transactions per case; repeat the primary public race with 20 simultaneous attempts and assert exactly one success when one table is available.

| ID | Exercise | Required assertion |
| --- | --- | --- |
| I-BOOK-01 | Two customers same table/overlap, direct SQL violating exclusion | Exactly one commit, loser receives `SLOT_UNAVAILABLE`; DB constraint remains last safety net. |
| I-BOOK-02 | Two combinations sharing a physical table, single-vs-combination | All-or-nothing allocations; no physical table in overlapping bookings even with different combination IDs. |
| I-BOOK-03 | Booking edit moves time/table, conflict halfway through multi-table allocation | Failure rolls back entire edit and retains old allocation; optimistic version rejects stale edit. |
| I-BOOK-04 | Cancel/no-show/complete, retry same transition, seat then extend | Inactive allocation releases slot exactly once; seated extension may not overlap later active booking; no constraint bypass. |
| I-BOOK-SEAT-TIME | Seat an 18:00 booking at 17:00; seat another late enough to need full meal duration beyond original end | Early SEAT extends occupied start to seated_at minus buffer; late SEAT extends end to max(existing end,seated_at+duration). Scheduled starts_at preserved; any conflict returns 409 with original status/claims intact. No walk-in can claim an early-seated table. |
| I-BOOK-OVERDUE | First reservation remains SEATED past finite expected end; second future reservation has nonoverlapping planned range; competing walk-in/SEAT/direct DB insertion | No second seated_active row for a physical table can commit, even though time ranges do not overlap; named presence uniqueness maps 409 TABLE_OCCUPIED while temporal exclusion maps 409 SLOT_UNAVAILABLE. Overdue tables disappear from all new candidate availability until host extends/reassigns/clears; existing future reservation cannot SEAT over actual presence. COMPLETE clears claims; no timer does. Combination presence claims are all-or-nothing. |
| I-BOOK-05 | Party too large, table archived/reduced capacity, hours/block changes racing booking | Capacity/configuration validation under same location lock; no invalid future allocation silently accepted. |
| I-BOOK-06 | Buffer touching vs overlap, midnight hours, min notice/horizon, blocked dates | `[start-buffer,end+buffer)` exact behavior; server clock and location zone determine limits. |
| I-BOOK-07 | DST spring gap/fall repeated time, 23/25-hour days, midnight cutoff | Reject impossible wall time; explicit offset preserves repeated instant; no duplicate/omitted physical slot from UTC conversion. |
| I-BOOK-08 | Waitlist duplicate seat requests, walk-in vs public booking | Same allocator, one internal reservation link, atomic state change; waitlist estimate alone holds no capacity. |
| I-WALK-IN | Dedicated staff walk-in command creates seated guest with no contact at server now | STAFF source, SEATED status, acknowledgement/audit, no public notice/horizon rule; still validates opening hours, capacity, buffers and conflicts through same allocator. Public request cannot invoke this exception. |
| I-BOOK-09 | Public availability/create spam, unexpected tenant/table IDs, injection | Configured rate limits are shared across instances, untrusted table/tenant IDs ignored/rejected, public schema exposes no guest data. |
| I-BOOK-10 | Retention anonymization vs active/future booking | Terminal older PII removed; active/future data preserved; immutable financial/audit records contain no erased guest contact. |
| I-PRIVACY-CLOCK | Frozen clock before/at/after 90-day boundary; terminal record edited yesterday; past booking never marked complete; abandoned waitlist; old-created future booking | terminal_at fixed on terminal transition, unaffected by updated_at; fallback past expected_ends_at or waitlist joined_at. Redact at anchor+90 days, protect future active booking; anonymized metadata still supports permanent public replay. |
| I-BOOK-REPLAY | Replay same public key before/after 24h cache expiration, after host cancellation/completion, after anonymization and hash-key rotation; alter body under same key | Initial create 201 CONFIRMED; every same-key replay 200 with existing non-PII current status/reference/time/party, never new allocation or false CONFIRMED. Changed body 409; versioned keyed digest remains verifiable without raw contact retention. Staff byte-exact replay semantics unchanged. |

## Browser journeys and visual quality

| Journey | Steps and outcome |
| --- | --- |
| E-OWNER | Invited owner magic-link sign-in → fake integration test/sync → import catalog → map variation → build/publish recipe → read current cost. Freshness, unknown costs, pending sync and failures are visible and named. |
| E-STOCK | Inventory role receives a partial PO → records waste → opens/posts stock count → views audit-backed ledger. Reload/double click/back button never duplicates posting. Cost/quantity inputs preserve typed precision. |
| E-REPORT | Owner imports golden completed sale/refund → sees matching item quantities/revenue/cost, data-quality warning for unmapped item, provisional menu net for unallocated refund → manager allocates refund → exact report and CSV. |
| E-HOST | Host creates/edits/seats/completes reservation → waitlist walk-in seating → conflicting edit is explained with available retry path. Host cannot read financial reports or integration secrets. |
| E-PUBLIC | Phone user selects valid date/time/party/contact and submits → confirmed reference; competing browser loses gracefully and can choose another slot without retyping contact. No guest names or table IDs exposed through availability. |
| E-SECURITY | Viewer and disabled/missing-grant users try direct URLs/API, public signup, another tenant's IDs, stale session after revocation → safe denial without records. |
| E-OUTAGE | Fake Square fails and database/job health degrades → local permitted pages remain useful when DB available, stale badge has last successful sync, failed actions preserve form state, public booking never shows false confirmation. |

Critical journeys run at 390px and 1440px; representative pages at 768px, plus 320px overflow smoke. Check keyboard-only operation, visible focus, dialog focus trap/return, associated labels, error summaries, status announcements, noncolor state labels, touch targets, zoom to 200%, screen-reader table headings and chart alternatives. Automated axe checks supplement manual review; they do not establish full WCAG conformance.

Follow the pinned current Taste Skill app workflow in UI_DESIGN.md: production build, app-mode inspector at its required widths, open and assess every resulting screenshot, fix top issues and repeat within the skill's bounded review loop. Do not apply marketing-page imagery/motion quotas to the working application or booking form. Store final screenshots/critique/inspector output as implementation evidence. No invented live business statistics or customer endorsements in production/demo screens; synthetic fixtures carry a visible demo label.

UI must test loading/empty/error/partial/stale/forbidden states for every reusable pattern. Data tables keep readable labels and actionable mobile alternatives; host timeline has a list alternative. Reduced motion suppresses movement without hiding content. No screen relies on color alone to distinguish reservations, low stock, or reconciliation states.

## Security verification

- Session cookies secure/httpOnly/sameSite as supported by Auth.js; no token in browser storage; logout revokes session; reused/expired magic link fails. Verify origin/CSRF handling for every internal mutation and login flow, not merely one endpoint.
- Role/location matrix and IDOR cases cover REST handlers, server-rendered page loaders, exports, scheduled jobs, and manually retried jobs. Auth.js built-in actions follow its supported security protocol; there is no second business Server Action API. Browser nav hiding does not count as authorization.
- Public endpoints have strict body size/schema/length limits, distributed rate limits and generic error messages; no mass assignment of status, table, tenant or role. Rate-limit spoofed forwarding headers according to trusted deployment proxy configuration.
- Webhook raw bytes, exact URL and timing-safe signature checks; only configured merchant/environment accepted. Cron/worker ingress uses a separate secret/auth context and constant-time comparison; no public job execution or arbitrary callback URLs.
- Secret scanner covers git/worktree artifacts, fixtures, logs and built browser bundles. Insert canary strings in test secrets and confirm absent from error envelopes, audit logs, snapshots, monitoring payloads and client bundles.
- Zod validation for every trust boundary; parameterized Prisma/tagged SQL only; stored note/name XSS rendered as text; CSV formula injection protection. CSP/security headers tested against deployed build; restrictive image/source policies reflect actual resources.
- Personal Square token can be broader than read-only OAuth scope: adapter allowlist and code scanning assert no payment/refund/order/catalog write SDK methods are callable. No credential-writing HTTP form accepts unvalidated secret reference or sends token back to clients.
- Dependency scanning with reviewed remediation and committed lockfile; no forced major upgrade without regression checks. Optional production telemetry must redact contact/secrets and apply documented retention.

## Square sandbox and actual-device release gates

Automated fake-adapter tests establish internal correctness. They do not prove Square availability, POS behavior, plan compatibility or completeness of payloads. Keep a verification ledger with check ID, date, API/SDK version, sandbox/production, seller plan, device/app version, request/event IDs, redacted observed payload, expected/actual result and owner reviewer.

| Gate | Controlled exercise | Release requirement |
| --- | --- | --- |
| SQ-01 | Sandbox token/location/currency/environment, paginated catalog with modifier/variation and tombstone | Authentication and normalized schema confirmed; scopes/permissions stated accurately. |
| SQ-02 | Sandbox completed order, split payment when supported, partial/full refund, update-time filters/pagination | Exact amounts/statuses/links verified for pinned API; unsupported fixture cases remain explicitly unverified. |
| SQ-03 | Signed webhook delivered, duplicate/retry/out-of-order, exact subscription event names | Raw signature and durable inbox verified; no event-only completeness assumption. |
| SQ-04 | Actual Square POS sale on target Free seller and target Plus seller, including custom line and modifier | Read API visible order/line/payment shape proves required workflows on both plans; no paid restaurant feature required. If separate accounts cannot be tested, compatibility remains an explicit launch gate. |
| SQ-05 | POS order creation/update, canceled/open order and late/offline sale where safely possible | Document observed event behavior and read visibility; polling catches sale without `order.created`; device behavior not inferred from sandbox-created API orders. |
| SQ-06 | POS refund/return/exchange and changed quantity relevant to this restaurant | No duplicate monetary reversal or ingredient restoration; unresolved ambiguities create an issue rather than guessed precise reports. |
| SQ-07 | Compare agreed business-date sample against Square Dashboard/export, then repeat sync | Explain all timing/discount/tax/tip/refund/service/custom-item differences, zero duplicate imports or stock effects. |

Use smallest practical controlled production transactions with owner approval and normal Square POS operation. RestaurantOS does not initiate charges/refunds during tests. Credentials are supplied securely to the deployment, never captured in verification evidence. If the target device/plan is unavailable, mark gate BLOCKED/NOT RUN with next required exercise, not PASS. Public documentation confirmation and sandbox/device verification are distinct evidence classes.

## Operational drills and performance

| Drill | Exercise | Pass condition |
| --- | --- | --- |
| O-CRASH | Stop worker after durable inbox/page/source commit, during lease, and before effect transaction commit; restart | Reclaimed job converges to same sorted source/snapshot/stock state, without lost cursor or duplicate effect; expired worker fenced. |
| O-REPLAY | Dry-run and execute bounded 90-day replay twice | First run identifies expected changes, second produces zero new business effects; audit and reconciliation remain understandable. |
| O-RESTORE | Restore production-like backup/PITR to isolated DB; verify migration/constraints and source replay | RPO ≤15 minutes and RTO ≤4 hours achieved in observed drill; reservations/local receipts manually reconcile before public reopening. Record actual measured times. |
| O-CREDENTIAL | Rotate Square token/signature/cron/auth secrets through documented procedure | New secret accepted, removed secret rejected when rotation window ends, local data retained, replays idempotent, no leaked values in logs. |
| O-ROLLBACK | Deploy compatible prior app version against expanded schema | Core sign-in/read/booking work; worker schema compatibility enforced; forward migration fix preferred over destructive down migration. |
| O-PRIVACY | Run retention on aged terminal records and recent active fixtures | Correct PII anonymized, future bookings intact, dedupe/source keys retained, dry-run counts and audit verified. |
| O-HEALTH | Stop worker/scheduler heartbeat, restart a new instance, record recovery drill | Old operational_state row cannot imply health; current heartbeat/release appears, job fences remain independent. RECOVERY_DRILL audit supplies sanitized measured RPO/RTO/outcome. MAINTENANCE_MODE rejects writes/public booking and pauses worker effects. |
| O-FALLBACK | Simulate RestaurantOS outage before service | Staff can use current encrypted/controlled reservation export/manual log; Square continues normal POS workflow; restore reconciliation procedure prevents rebooking conflicts. |

Performance fixture: one location, 90 business days, 100,000 order lines, 500 ingredients/recipes, 10,000 movements, 50 active tables and 1,000 future reservations, covering the architecture's minimum dataset. On documented production-like hardware with five simultaneous staff users, target p95 staff list read ≤1s, report ≤3s, public availability ≤1s and booking commit ≤2s excluding rate limiting/network; webhook durable acknowledgement <2s healthy and <10s response deadline. Treat these as measurable service goals, not external platform guarantees. Paginated lists cap result sizes; backfill runs bounded pages/chunks independently of request lifetimes. Record explain plans for report, latest cost/anchor and availability queries. Optimize only failed measured targets, preserving correctness.

## Acceptance and release checklist

Each phase stops at its acceptance boundary in IMPLEMENTATION_TASKS.md. Passing a later feature test does not waive a missing earlier security/integrity gate. Release review records test command results, known limitations, unapplied migrations, Square evidence, backup/restore evidence, and operator signoff.

1. Invited owner can sign in; roles/grants and two-tenant tests enforce all operations, including direct routes and exports.
2. Catalog and 30/90-day fake historical imports paginate and replay identically; signed webhook and reconciliation recover missed/late changes; stale data is visible.
3. Golden recipe, modifier, conversion, cost-history and unknown/zero cases produce exact expected output without rewriting published history.
4. Partial receiving, reversal, waste/count, sale correction and count-covered late arrival have exactly one audited effect.
5. Simultaneous bookings cannot overlap a physical table; hours/buffers/capacity/DST and waitlist allocation pass.
6. Golden revenue/refund fixture reconciles and unresolved source ambiguity prevents misleading precise menu-net/margin claims.
7. Full E2E, accessibility/responsive production-build review, secret checks and restore drill pass; target Free/Plus real-device gates carry honest evidence.
8. Setup, backup, credential rotation, stale/retry/replay, reservation fallback and incident recovery instructions are executable by a different operator.

No production-ready declaration is permitted while duplicate posting, cross-tenant access, double booking, missing recovery capability, or an unverified required Square capability remains open. Nonblocking limitations have visible product handling and an owner-approved follow-up; they are not silently hidden.






