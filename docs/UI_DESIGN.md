# RestaurantOS UI design specification

Planning baseline: 2026-11-04, America/Los_Angeles. This specifies future implementation; no screens, screenshot checks or browser tests are claimed complete. Contracts, permissions and financial rules come from [PRD](PRD.md), [architecture](ARCHITECTURE.md) and [API contracts](API_CONTRACTS.md).

## 1. Design direction and Taste Skill use

Reading this as: an operations app for restaurant owners and service staff, with a calm, precise, practical visual language using owned shadcn/ui components and Tailwind CSS. The public booking surface uses the same readable system with fewer controls. The interface should feel useful during a service, with clear decisions, honest data and short forms.

The requested [Taste Skill repository](https://github.com/Leonxlnx/taste-skill) is the design-method source. Use stable [v2.1.5](https://github.com/Leonxlnx/taste-skill/releases/tag/v2.1.5), commit [`12af471f627f866411b4bd785b19646d3672784c`](https://github.com/Leonxlnx/taste-skill/commit/12af471f627f866411b4bd785b19646d3672784c), for this plan's app workflow. Do not follow mutable `main`, whose later workflow differs, or substitute the older installed skill that excludes dashboards. The pinned version supports a dedicated app path rather than applying marketing-page composition to dashboards. Reuse restrained panels, alignment, visible hierarchy and responsive navigation. This document fixes the RestaurantOS design decisions so later tasks do not randomly change visual style.

Taste execution at implementation time: read the pinned app workflow and its referenced app rules; inspect the actual browser output at mobile/tablet/desktop; compare screenshots, repair the most material defects and record evidence. App design is constrained by operational accessibility, correctness and the user-selected Tailwind/shadcn stack. Do not introduce a second component system, marketing hero, decorative photography, fake charts, brand ticker or excessive animation into staff workflows. Actual data visuals are generated from report DTOs, with accessible tables and quality metadata.

### Source review and execution contract

The planning review read these pinned text inputs completely: [README](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/README.md), [SKILL.md](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/SKILL.md), [app-screens.md](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/references/app-screens.md), [type.md](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/references/type.md), and [layout.md](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/references/layout.md). The app helper `scripts/lib/app-draw.mjs` (195 lines), `scripts/inspect.mjs` (296 lines), and `scripts/lint.mjs` (115 lines) were also read completely. The draw entry-point app dispatch, fresh-browser launch behavior and `library/app.json` commerce kind were checked in the relevant sections. This is a complete read of those documents, not a claim to have audited every source file, dataset, image or bundled demo in the repository. `colour.md` could not be fetched during review and remains unverified; T001 records the gap and does not infer its content. Recheck availability at T008/T062. The skill itself directs users to query its library with scripts rather than read the whole data library.

Use Node 24.22.2 from [DEPENDENCY_BASELINE](DEPENDENCY_BASELINE.md) and an installed Chrome/Edge/Chromium. In the commands below `<skill>` means the absolute `skills/taste-skill` directory checked out at the fixed commit; `<style-id>` is the selected ID returned by the first command, recorded with its seed in the design decision. Run from the RestaurantOS root. These commands are specified for future execution and have not run during this planning task.

```text
node <skill>/scripts/draw.mjs --app --kind commerce --brief "RestaurantOS restaurant operations: ingredients, recipes, purchasing, reservations and reconciled sales" --screens overview,analytics,list,detail,settings,builder,report --theme light --keep palette,type --options 3
node <skill>/scripts/draw.mjs --app --kind commerce --brief "RestaurantOS restaurant operations: ingredients, recipes, purchasing, reservations and reconciled sales" --screens overview,analytics,list,detail,settings,builder,report --theme light --keep palette,type --style <style-id>
node <skill>/scripts/lint.mjs --app app src/components
node <skill>/scripts/inspect.mjs --app http://localhost:3000/book/<restaurantSlug> --out .taste-skill/inspect/public
```

Choose the offered composition that best supports the count-anchor/usage-coverage strip and transaction-heavy workflows; retain this document's fixed palette/type and Tailwind/shadcn foundation. Record deviations instead of mixing several offered styles. Translate useful composition into owned components; do not add a second CSS component system. The app path has no marketing imagery or motion quota.

The pinned inspector opens a fresh browser profile and has no cookie, storage-state or authenticated-session flag. Therefore it cannot directly inspect protected staff routes after the normal magic-link login. Do not inspect the login redirect and claim a dashboard pass. For protected routes, use authenticated Playwright screenshots after a real seeded magic-link flow, source lint and the app critique; record the official-inspector limitation. An authenticated test harness may reuse upstream measurements/rules only if documented and tested, with no production auth bypass. Inspect public booking directly using the official command. At 1440/768/390, inspect every screenshot, fix the three largest defects per review round, and stop after at most three rounds; all measured failures must be fixed and any remaining warning must have a recorded reason. Authentication and financial correctness still require domain tests.

## 2. Tokens and visual rules

Light mode is the v1 release theme. Dark mode is deferred until every page/status/chart has explicit tested tokens; do not ship an untested theme switch. Keep one palette and shape system across public and staff screens. Define tokens in `app/globals.css` and expose through Tailwind's selected stable version; components use semantic tokens rather than raw page-specific colors.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#F7F8FA` | App canvas. |
| `--surface` / `--popover` | `#FFFFFF` | Primary working surfaces and overlays. |
| `--surface-muted` | `#F0F2F5` | Inactive controls and restrained grouping; table headers keep the table surface. |
| `--foreground` | `#18212D` | Primary text and financial figures. |
| `--muted-foreground` | `#566275` | Secondary labels; never reduce opacity for essential text. |
| `--border` | `#D4DAE3` | Separators; verify required control boundaries at 3:1 and use darker control border below. |
| `--input-border` | `#788596` | Interactive input boundaries. |
| `--primary` / foreground | `#175B4A` / `#FFFFFF` | Principal action and main chart series. |
| `--primary-soft` | `#E7F2ED` | Meaningful chart/data emphasis, used sparingly. |
| `--nav-selected` / foreground | `#E8EBF0` / `#18212D` | Neutral selected navigation, with a clear weight/shape cue. |
| `--destructive` / soft | `#A32331` / `#FDECEF` | Destructive actions and blocking error text. |
| `--warning` / soft | `#854500` / `#FFF3DC` | Stale/incomplete/review-required states. |
| `--success` / soft | `#176443` / `#E8F5EC` | Confirmed successful states. |
| `--focus-ring` | `#155E75` | 2px outline plus 2px offset, never clipped. |
| Chart series | primary `#175B4A`, secondary `#536982`, comparison `#8D6472` | Limited meaningful series, differentiated by line styles/labels too. |
| Radius | inputs/buttons 6px; panels 10px; dialogs 12px; badges 4px | No arbitrary pill shapes except a true segmented toggle. |
| Shadow | panel none; popover `0 8px 28px #18212D1A` | Elevation only for overlay layers. |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48px | Use consistently, with 8px vertical form rhythm. |

Use a system sans stack for T002 to keep builds offline. A later UI task may use Geist Sans through `next/font/local` after verified, licensed font assets are committed; figures use tabular numerals. Page title 28/36px weight 600 desktop, 24/32 mobile; section heading 20/28 weight 600; body/control 16/24; dense data 14/20 desktop only; helper text 14/20. Do not use uppercase tracked eyebrows for ordinary form labels. Money/quantities right align; names/dates/status left align. Decimal formatting preserves meaningful unit precision without exposing arithmetic artifacts; all calculations remain server-side.

Buttons and inputs are at least 44px tall; kitchen/host primary actions 48px. Maintain at least 8px between adjacent touch targets. Table action buttons have accessible names including the row subject. Icons use one family, Radix Icons, at 18/20px; supplement with text for major actions. No bespoke decorative SVGs. Status uses text plus icon/shape, never color alone. Motion is limited to 120–180ms fade/translate for sheets/dialog feedback; honor `prefers-reduced-motion`, and avoid animated counters or looping skeletons. Navigation chrome remains neutral gray/ink; spend green on principal actions and actual data. Table headers use quiet typography and alignment on the same surface, without a colored or shaded header band.

## 3. Navigation, shell and responsive layout

Staff shell has a persistent restaurant name, current location name, business-date context when relevant, user menu and sign out. No enabled location switch exists in v1. Navigation order: Overview; Reservations; Inventory; Recipes; Purchasing; Reports; Settings. Suppliers are under Purchasing; Catalog/Imported Sales/Reconciliation under Reports or integration subnavigation, not Square-like checkout controls. Preserve stable route labels and page titles in breadcrumbs.

| Role | Default landing | Visible main navigation |
| --- | --- | --- |
| OWNER / MANAGER | `/dashboard` | Overview, Reservations, Inventory, Recipes, Purchasing, Reports, permitted Settings. |
| HOST | `/reservations` | Reservations with waitlist; readonly table reference. |
| INVENTORY | `/inventory` | Inventory, Purchasing, Suppliers. |
| VIEWER | `/dashboard` | Overview, Reports. |

OWNER Settings contains People, Restaurant, Square Integration, Audit, Operations. MANAGER Settings contains Booking Configuration/Tables and readonly Square Integration Status/Sync Runs. Other roles do not receive inaccessible menu items. Direct navigation still receives server authorization. The integration health summary appears to O/M/V where permitted without exposing secrets/job payloads.

Breakpoints: 0–639px phone; 640–1023 tablet; 1024+ desktop; 1280+ wide. Desktop sidebar 232px, collapsed into a top-bar menu sheet below 1024px. Top bar 64px; content maximum 1600px, padding 24px desktop, 16px tablet/phone; pages with a narrow editor use maximum 800px. Page header is title/context then filters/action row. Primary CTA remains visible without scrolling on key transactional pages. No full-page horizontal overflow.

At phone width, report metrics become a two-column definition list or stacked summary, filters wrap, and tables become labeled rows/cards where comparison is unnecessary. Wide ledger/report tables may scroll in a named region with a visible affordance, sticky first identity column and alternate compact view. Host timeline changes to agenda by time/table with conflict badges; never require precision drag/drop. Form grids collapse to one column. Dialogs become bottom/full-width sheets on phone, respecting safe areas and viewport keyboard. Use `min-height:100dvh`; do not lock content to viewport height.

## 4. Shared owned components

Place primitives under `src/components/ui/`; keep domain pieces under `src/components/domain/`. Use shadcn/ui button/input/label/textarea/select/checkbox/dialog/alert-dialog/sheet/table/tabs/popover/tooltip/calendar primitives, customized through tokens. Verify installed dependencies before importing. Server Components render initial authorized data; client leaves own interactive forms/filters/dialogs, not business arithmetic or permission decisions.

| Component | Required contract and behavior |
| --- | --- |
| `AppShell` / `PageHeader` | Authorized nav, skip link, stable title, actions, breadcrumb; no secrets/role override in client. |
| `FilterBar` / `BusinessDateRange` | URL-backed validated filters; show timezone and exclusive end convention; preserve filters on export/detail return. |
| `DataTable` | Caption, sortable header buttons, cursor pagination, loading/empty/error states, row identity, responsive compact alternative; no arbitrary all-record fetch. |
| `MoneyValue` / `QuantityValue` | Format integer-string cents/decimal-string quantity and unit; null renders em dash plus accessible “Unknown”, with a reason link when supplied. Never coerces null to zero. |
| `StatusBadge` | Fixed status label/icon/semantic colors; unknown server enum becomes “Needs review” without silently mapping to completed. |
| `FreshnessBanner` | Per-source last success, projection freshness, stale/degraded reason and timestamp; action visibility by role. No green “Synced” while projection is failing. |
| `CoverageSummary` | Known/total line count and revenue coverage, unmapped/uncosted/unallocated counts; provisional metrics clearly identified. |
| `CountAnchorCoverageStrip` | RestaurantOS's distinctive working element: a compact factual strip joining the latest physical-count anchor/cutoff, subsequent theoretical usage and unknown-usage coverage. Link each segment to its evidence. No progress graphic implies measured physical certainty. |
| `FormField` / `ErrorSummary` | Persistent label, required text, instructions, `aria-describedby`, inline errors plus focusable summary. Retain valid values after failure. |
| `MutationButton` | Pending state, double-submit prevention; request key stable across a retry of the same command; never indicates success before commit. |
| `ConflictNotice` | 409 version/slot conflict; clear refresh/review action; preserve user draft and original committed reservation/receipt state. |
| `ConfirmReasonDialog` | Consequence, affected record, required reason and explicit action label; suitable for reversal, cancellation, publication/replay. |
| `AuditTimeline` | Actor/date/action/reason, immutable revision links; redacted values only. |
| `UnitAmountInput` / `PackSelector` | Base/unit compatibility, explicit converted preview, decimal text input and server validation; no JS floating-point cost totals. |
| `RecipeComponentEditor` | Ingredient, purchased quantity/unit, yield/loss, signed modifier rows, unknown states and returned server cost preview. |
| `ReservationForm` / `AvailabilityPicker` | Party/date/UTC slot with local offset labels; advisory status; same schema for public subset/staff extensions. |
| `TableAllocationPicker` | Only returned valid single tables/approved combinations, capacity and time; free-form force allocation unavailable. |
| `ExportJobStatus` | Queue/progress/failure/expiry, authenticated download action and filter summary; no guest data in toast text. |

All read pages support: initial loading; empty with authorized next action; populated; failed with retry/request ID; stale partial data; forbidden; archived record; and session expiration. Mutation forms additionally support invalid, pending, succeeded, conflict and recoverable failure. A page must not fabricate placeholder totals while data is absent. Demo mode has a persistent “Demo data” banner.

## 5. Page specifications

Routes below are UI routes; mutations call the matching `/api/v1` or `/api/public/{slug}` contracts. Do not add a second server-action business interface. All list pages preserve filters in URL and use server pagination where API provides it.

| Route / users | Content and principal actions | Required edge/state behavior |
| --- | --- | --- |
| `/login`, invited staff | RestaurantOS wordmark, email field, “Send sign-in link”; generic sent state, expired link recovery. | Unknown email gets same response. No password field/self-registration; no demo shortcuts in production. |
| `/dashboard`, O/M/V | Date range, menu sales, theoretical food cost, food-cost %, contribution margin; sales trend/table; top dishes; source/coverage summary. | Unknown net sales or incomplete costs render unknown/provisional with reasons. Negative/zero denominator yields no percentage. No live-check claim. |
| `/inventory`, O/M/I | Ingredient, estimated on-hand/base unit, reorder level, latest count/source freshness, unknown-usage warning; search, low-stock filter, receive/count/waste actions. | No opening count means explicitly unanchored; negative estimate warning. Hide recipe/report pricing views from unauthorized roles. |
| `/inventory/ingredients`, O/M/I | Searchable ingredient directory with base unit, packages/suppliers, archival status and create/edit actions; link detail. | Available before stock services are implemented; current cost/balance unavailable states are explicit and do not query unmigrated services. `/inventory` becomes the balance overview when stock is available. |
| `/inventory/ingredients/[id]`, O/M/I | Ingredient settings/packages, current estimate/anchor, movement ledger and acquisition history; edit/archive/package action. | Base dimension cannot silently change after use. Archive preserves history. Cost-basis write only O/M. |
| `/inventory/waste`, O/M/I | Ingredient, positive quantity/unit, reason, optional reason text; post. | Require text for OTHER; server time; no backdate; confirmation shows actual committed movement. |
| `/inventory/stock-counts`, O/M/I | Count drafts/history and new count; actual quantities by ingredient, expected estimate separately. | Explain controlled physical pause; partial count explicit; final confirmation shows server cutoff/variances; posted count readonly. |
| `/inventory/adjustments`, O/M/I | Ingredient, signed quantity, required reason and source reference optional; post correction. | Explain adjustment changes estimate, financial refund does not automatically return stock. No delete movement action. |
| `/inventory/movements`, O/M/I | Paged ledger filtered by ingredient/type/effective date; signed base quantity, effective/posted time, source and count coverage. | Mixed units remain separate per ingredient; immutable movement links and positive reversal rows are explicit. |
| `/recipes`, O/M | Variation name, mapped/unmapped status, version effective date, returned cost/unknown reason; search/filter/new recipe. | Mapping is per variation, never parent item. Unknown cost does not render $0.00. |
| `/recipes/[id]`, O/M | Draft editor, yielded portions, component quantities/loss, modifier deltas, preview cost, publish and version history. | Publish immutable version with effective instant; negative demand/unknown modifier errors; current date not silently used for historical pricing. |
| `/recipes/mappings`, O/M | Unmapped variation/modifier queue, source catalog label/ID, assign recipe or acknowledge modifier no effect with reason. | Deleted catalog entries retained as archived; custom lines need review. Historical resolution requires owner replay, not quiet recomputation. |
| `/recipes/costs`, O/M | Current per-variation recipe cost/yield/basis timestamp and mapping-health filters; link to effective recipe/version and missing ingredients. | Current recipe estimate is separate from historical sale-cost reports; no invented price or zero cost for missing basis. Mapping health lives on `/recipes/mappings`, not a second independent mapping workflow. |
| `/suppliers`, `/suppliers/[id]`, O/M/I | Contact/lead time/notes and linked pack/PO list; create/edit/archive. | Supplier notes excluded from public UI; archival keeps historical purchase records. |
| `/purchasing`, `/purchasing/[id]`, O/M/I | PO state, supplier, lines/ordered/net received/outstanding, totals, status actions and receipt links. | Partial receiving explicit; allowed transition buttons only; stale version refresh preserves draft. No “Send order” unless separately authorized external action exists. |
| `/purchasing/receive`, O/M/I | PO/direct-receipt mode, actual delivered quantity, pack/base conversion and acquisition amount; post once. | Show actual receipt totals vs PO estimates; overflow/over-receipt validated; pending/retry retains key. |
| `/purchasing/receipts/[id]`, O/M/I | Immutable posted lines, actor/time, linked stock/cost/PO effects, reverse with required reason. | No edit posted fields; reversal shows consequences/once-only rule; replacement is separate posting. |
| `/reservations`, O/M/H | Restaurant local service date, agenda/table timeline, party/status/contact, availability summary; new booking/walk-in, seat/complete/cancel/no-show; waitlist panel. | Date timezone explicit; no payment/check controls. Early/late seat conflict preserves old state, offers valid alternate allocation. |
| `/reservations/[id]`, O/M/H | Guest details, party, start/end/local offset, table claim/buffer, notes and transitions; OWNER-only link to authorized audit page. | Concurrent edit409 retains existing allocation; terminal status readonly. Do not expose an uncontracted audit feed to M/H. Contact only authorized users; no guessing public reference lookup. |
| `/reservations/waitlist`, O/M/H | Joined time, party, quoted wait, manual-notify state/contact, seat/cancel/left. | Estimated wait is manual and labeled; NOTIFIED sends no SMS; seat conflict leaves waiting party unchanged. |
| `/tables`, O/M editable; H readonly | Table labels/capacities, approved combinations, active/future usage. | Configuration invalidating active bookings blocked with affected booking links. No automatic Square floor plan sync claim. |
| `/settings/booking`, O/M | Hours/overnight flags/closures, duration/buffers, lead/horizon/party, terms/privacy/contact and publish status. | Cannot publish without required configuration. DST handling explained through local offsets; conflict list before applying restrictive changes. |
| `/reports/sales`, O/M/V | Sales/menu mix/trends, report filters, source totals/allocated refunds, quality summary; aggregate CSV. | Unallocated refunds make affected net unknown. Tips/tax/service separate. Positive original sale lines counted once. |
| `/reports/food-cost`, O/M/V | Variation qty/revenue/theoretical cost/food-cost %/contribution/coverage and known-subset summary. | Prepared-cost retained after refund; denominator/coverage labels explicit; not accounting profit. |
| `/reports/purchasing`, O/M/V | Supplier gross spend, reversal events, net spend and trend/table; aggregate CSV. | Preserve period of original receipt and later reversal; no silently rewritten previous report. |
| `/reports/inventory`, O/M/I | Waste quantities/cost basis, count variances and low-stock report; operational CSV. | Missing waste cost remains unknown; no aggregate VIEWER access to operational inventory. |
| `/reports/reconciliation`, O/M | Filter issues, linked orders/payments/refunds, mismatch classifications and notes; refund allocation editor. | Allocation parts must sum to refund cents; line attribution optional/verified; no edit Square/payment/refund button. |
| `/reports/catalog`, O/M | Imported Square items/variations/modifiers, source ID/version, deleted/location availability and mapping health; filter/search/link recipe mapping. | Source records readonly; archived source names/history preserved; no catalog edit that writes to Square. |
| `/reports/imported-sales`, O/M | Canonical order list with source state, close/business date, source total, quality and projection status; detail links. | Noncompleted orders are explicitly excluded from finalized sales; duplicates from other discovery streams do not create rows. |
| `/reports/sales/[id]`, O/M | Readonly normalized order lines/modifiers, source revision, return links, linked payments/refunds and projection quality. | No card/customer payload; omitted source fields render unavailable, not invented. |
| `/settings/integrations/square`, O full; M status | Environment/merchant/location/API pin, configured secret reference status, source timestamps, sync history/issues; owner test/sync. | Never input/display token value. Paused/revoked state and operator rotation instructions; manual jobs return durable progress. |
| `/settings/integrations/square/runs`, O/M | Paged sync history with frozen window, stream, committed counts, state, elapsed time and sanitized error; selected run shows its bounded job/issue details. | A committed page checkpoint is not a completed source watermark. MANAGER can inspect but cannot replay/backfill/test credentials. |
| `/settings/people`, O | Membership invitations/status/role/location grants and suspend action. | Reauthentication for role change; last-owner denial; invitation delivery pending does not imply unusable membership. |
| `/settings/restaurant`, O | Name/location and prospective timezone/business-cutoff policy. | Explain stored historical dates preserved; require reason/effective future instant; do not offer retroactive timezone edit. |
| `/settings/audit`, O | Filter actor/entity/action/time; redacted event details and revision links. | No guest contacts/secrets; append-only display; download only allowed contract scope. |
| `/settings/operations`, O | Worker/source/projection health, queues/dead jobs, backup/recovery drill status, previewed bounded replay and export status. | Recovery/projection replay requires scoped preview/fingerprint/reason; no one-click clear-all ledger/import. |
| `/book/[restaurantSlug]`, public | Restaurant name/local timezone/contact, party/date/available time, guest contact form, terms and separate optional marketing checkbox. | No table IDs/other guest data; no holds. Larger party/contact-host path; unavailable409 refreshes slots without losing entered contact. |
| Public booking result, public | Own reference, committed party/local date/start/end/timezone, current status and contact instructions. | Newly created201 shows confirmed. Permanent-key replay after response cache expiry may return200 with current CANCELED/COMPLETED status: label as an existing booking result, never a new confirmation. Optional confirmation email failure does not change reservation. No PII in URL; no public cancel/search endpoint. |

## 6. Financial, inventory and integration presentation

Dashboard uses a compact metric row above a wide trend and menu table, not equal decorative cards. Each figure has a label, selected business period, units and data-quality context. A report renders either authoritative complete metric, explicitly provisional before-unallocated-refund amount, or unknown; tooltips cannot be the only disclosure. Comparison percentage appears only for matching complete periods. A downloadable/table equivalent supports every chart.

Separate “Menu sales,” “Collections,” “Tax,” “Tips,” “Service charges” and “Refunds”; never combine them into an unexplained revenue number. Food-cost percentage labels its exact known subset if coverage is partial. “Contribution margin” helper copy states excluded overhead. Report filters include current timezone/cutoff and freshness. Source sync success does not clear a failed-projection banner.

Inventory on-hand label is “Estimated stock”; subtext includes last physical count and cutoff, unknown sale usage and pre-count late movements when relevant. Distinguish receipt, waste, adjustment, count variance and theoretical sale consumption in the ledger. Sale corrections append reversal/delta rows. Financial refund never shows a generated receipt. Cost preview uses returned server snapshots/basis dates and warns if current recipe price is distinct from historical sale cost.

Status freshness follows the thresholds in SQUARE_INTEGRATION/API contracts; do not invent separate client thresholds. Present last source completion and last projection completion independently. OWNER gets “Sync now” and repair controls; others get status and contact-owner instructions. Worker job count/completion reflects durable committed pages, never an optimistic percent inferred from an unknown total.

## 7. Forms, privacy and accessibility behavior

On submit, preserve field state, validate via shared schema/server response, focus the summary/first invalid field and announce errors with `aria-live`. A network timeout uses the same request key for a retry. A version conflict asks the user to review current server data; never auto-overwrite. Dialog dismissal returns focus to its trigger; destructive dialogs describe the effect and require reason where contract requires it. Toasts supplement persistent inline confirmation/errors and contain no guest contacts/secrets.

Reservation date/time controls show America/Los_Angeles (or configured timezone) and offset when ambiguous. DST nonexistent slots are absent; repeated-hour slots have distinct labels. Public date uses service date rules; business-day cutoff is a report convention, not guest-facing scheduling subtraction. A selected slot is advisory until successful booking. Screen reader announcements identify availability reload completion without reading all slot buttons.

The host COMPLETE action label is “Table cleared and ready.” Explain that it immediately releases all table allocations, including cleanup buffer, and is unrelated to payment completion. A party leaving or settling a Square check alone must not trigger it automatically. If a seated party remains beyond its scheduled interval, show a persistent “Overdue: table still occupied” warning with Extend, Reassign and Table cleared and ready actions. That table is excluded from all new allocations until resolved, including future availability returned while overdue; existing confirmed reservations stay visible and cannot be seated onto the occupied table. Host extends the claim through the allocator; conflicts require a valid reassignment or operational resolution and never silently displace another booking. No countdown changes a SEATED party to complete or clears the warning automatically.

Native labels, semantic headings/landmarks, skip link, focus-visible, keyboard table sorting and dialog trapping are required. No hover-only information, drag-only seating or color-only warnings. At 200% zoom and 360px width, critical actions stay reachable and text does not clip. Guest notes/privacy copy are plain and limited; marketing opt-in defaults false. Public success uses a no-store page/state; guest data never enters URL/query parameters, analytics or console logs.

## 8. Design acceptance evidence required during implementation

For every page family, record desktop 1440px, tablet 768px and phone 390px screenshots plus a 360px overflow check. Review populated/loading/empty/error/unknown/stale states using synthetic fixtures. Verify owner, host, inventory and viewer navigation, full public booking flow, keyboard-only form/dialog use, visible focus, contrast and reduced-motion settings. Report/chart screenshots must use plausible fixtures with partial mapping/unallocated refunds so disclosures are actually assessed.

Run the pinned Taste app inspection when compatible with the installed local browser/toolchain; record its exact command/output and manually inspect screenshots. Automated inspection cannot certify booking concurrency, financial arithmetic or authorization. Those require TESTING's service/database/E2E checks. If an upstream tool is unavailable, record the limitation and perform equivalent documented browser checks rather than claiming it ran. Frontend tasks are done only after the screen matches this specification, contracts/RBAC are enforced, accessibility defects are repaired and screenshot evidence is linked in progress notes.
