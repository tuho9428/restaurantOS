# RestaurantOS API contracts

Planning specification, 2026-11-04. No routes have been implemented. [ARCHITECTURE](ARCHITECTURE.md) owns decisions; [DATABASE](DATABASE.md) owns persistence. All business forms use these contracts; React Server Components may call the same read services without HTTP.

## 1. Conventions

Staff base path `/api/v1`; public base `/api/public/{restaurantSlug}`; Square webhook `/api/webhooks/square`; Auth.js `/api/auth/[...nextauth]`. Every route uses Node runtime. Staff scope is derived from the authenticated membership and the single enabled location; tenant IDs in bodies are forbidden. A future location selector must add explicit membership validation rather than reusing arbitrary query IDs.

Notation: `?` optional; `null` explicitly absent; all unlisted object properties rejected. `ID` is UUID; Square IDs are opaque strings of 1..255 characters and never parsed as UUIDs (apply stricter resource limits only where the pinned Square schema requires them). `Text(n)` means trimmed nonempty plain text up to n Unicode characters (no HTML); nullable notes are at most 2,000 characters. Email max254; telephone max32 with conservative validation, not a claim that every locale uses US formatting. Currency is literal `USD`.

| Scalar | JSON representation and limits |
| --- | --- |
| `Cents` | Signed base-10 integer string, e.g. `"1250"`; bigint bounds. Input purchase prices/allocations are nonnegative, max `"1000000000"` per line; signed adjustments can be negative. Reject decimal/exponent notation. |
| `Qty` | Decimal string with <=6 fractional places, e.g. `"125.500000"`; absolute value <=1,000,000,000. Reject exponent notation, NaN, Infinity and locale commas. Positive/nonnegative constraints are field-specific. |
| `Rate` | Decimal string with <=12 fractional places; nonnegative cost per base unit. Internal higher precision retained until documented quantization. |
| `Fraction` | Decimal string, 0 <= value <1, <=8 fractional places. |
| `Instant` | RFC3339 UTC or explicit-offset string, normalized to UTC `Z` in responses. Reject offset-free date-times. |
| `BusinessDate` | Valid `YYYY-MM-DD` interpreted through restaurant timezone/cutoff; never parse using server local timezone. |
| `Version` | Positive JSON integer for local optimistic concurrency, not Square versions (which are strings). |

Success envelope: `{data:T,meta:{requestId:string,...qualityMetadata}}`. List envelope: `{data:T[],page:{nextCursor:string|null},meta:{requestId}}`. Default limit25, max100; filters `cursor?`, `limit?`, `q?` max100, and documented resource filters only. Cursor is opaque signed `(scope,filterHash,sortValue,id)` and invalid under different filters. Default stable sort `createdAt DESC,id DESC`; source sales may specify `closedAt DESC,id DESC`. No unlimited lists. `GET /me` returns effective permissions so UI does not infer new policy from role names.

Create returns201, ordinary read/update200, accepted jobs202. Staff idempotent replay returns the exact persisted original status/body and `Idempotency-Replayed:true`; a replay of 201 remains 201. Public booking creation has one exception: same-key replay returns 200 with the same reservation's current non-PII status and confirmation. A host cancellation cannot create a new booking or falsely appear as currently confirmed. No physical deletion API for posted history; archives are mutations. An empty list is200. Date report filters require `from` inclusive, `to` exclusive BusinessDates, max366 days, default current business date through next date; every response echoes timezone/cutoff and UTC bounds.

Authenticated responses are private/no-store. Public availability and confirmation no-store; public restaurant publication can cache60s. Do not expose Next.js internal errors, Prisma error names or Square raw payloads. Source IDs only on restricted integration/report details, never public booking responses.

### Errors

```
{ "error": {
  "code": "SLOT_UNAVAILABLE",
  "message": "That time is no longer available. Choose another time.",
  "requestId": "...",
  "fieldErrors": [{"path":"startsAt","code":"unavailable","message":"Choose another time."}],
  "retryable": false
} }
```

`fieldErrors` is optional and contains only submitted field names, no hidden resource values. Error codes are stable; messages may be improved without breaking clients.

| HTTP | Codes / interpretation |
| --- | --- |
| 400 | INVALID_JSON, INVALID_CURSOR, INVALID_SIGNATURE, UNSUPPORTED_EVENT_SHAPE |
| 401 | UNAUTHENTICATED, REAUTHENTICATION_REQUIRED (fresh login needed) |
| 403 | FORBIDDEN, CSRF_FAILED, ORIGIN_REJECTED |
| 404 | NOT_FOUND for missing or foreign-scope IDs/slug/unpublished restaurant |
| 409 | VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, REQUEST_IN_PROGRESS, INVALID_TRANSITION, SLOT_UNAVAILABLE, TABLE_HAS_BOOKINGS, TABLE_OCCUPIED, OVER_RECEIPT, LAST_OWNER, SOURCE_REVISION_CONFLICT |
| 413 | PAYLOAD_TOO_LARGE |
| 415 | UNSUPPORTED_MEDIA_TYPE |
| 422 | VALIDATION_FAILED, UNIT_MISMATCH, UNKNOWN_COST_BASIS, NEGATIVE_RECIPE_REQUIREMENT, REFUND_ALLOCATION_MISMATCH |
| 429 | RATE_LIMITED, Retry-After in seconds |
| 500 | INTERNAL_ERROR, AUDIT_WRITE_FAILED; log sanitized requestId only |
| 503 | DATABASE_UNAVAILABLE, INTEGRATION_UNAVAILABLE, MAINTENANCE_MODE; Retry-After when known |

Square 429/5xx inside a job change job status, not a delayed browser request. A status endpoint remains200 with degraded connection details; connection test can return200 `{ok:false,code}` for credential diagnosis without exposing token data. PostgreSQL exclusion violations map409; failed serializable transactions retry at most3 times with jitter then409 RETRY_CONFLICT. Timeout acquiring a booking lock returns409 RETRY_CONFLICT, not success.

## 2. Authentication, RBAC and mutation protocol

Role shorthand: `O` OWNER, `M` MANAGER, `H` HOST, `I` INVENTORY, `V` VIEWER. `OM` means either. An endpoint's listed roles are exhaustive; each still requires location grant. `staff` below means all active roles only when listed. Suspended/disabled identities cannot operate. `GET /me` is available to any authenticated identity but does not leak other memberships.

Auth.js owns email login, callback, session, CSRF and signout routes. `/login` requests a link through supported Auth.js APIs. Unknown/inactive email receives same generic screen; no signup. Staff endpoints accept only secure cookie sessions. Business bearer tokens and client-selected roles are unsupported. Sensitive owner changes require `lastAuthenticatedAt` within15min; if expired re-login, not just refresh cookie. Revoke all active sessions on identity disable; per-operation membership check gives immediate effect.

All staff POST/PATCH require `Content-Type: application/json`, allowed same-origin `Origin`, session-bound `X-CSRF-Token`, and `Idempotency-Key` UUIDv4 generated by a cryptographically secure UUID generator. Body limit64KiB; recipe/count payload max256KiB with per-array limits200. Webhook limit1MiB. Staff read requests have no idempotency key. Rate limit authenticated general API120/min/user; mutations60/min/user; sync requests6/hour/connection; login5/15min/email-hash and20/15min/IP-hash. Persistent DB buckets, not per-process memory.

Mutation transaction: validate and authorize; canonicalize validated body and hash with method/path/scope; claim unique request key for actor+operation; serialize concurrent use through unique row/lock. Same key/different hash409; in-flight replay waits at most5s then409 REQUEST_IN_PROGRESS with Retry-After1. Recheck entity version, execute domain change + audit + job/outbox insertion + final response/status in the same transaction. Commit only with a durable final response; transaction errors roll back key claim. Cache successful2xx responses, not transient failures. Retain staff replay responses7days, public24h; permanent source/document posting keys remain after cache expiry. Public booking replay always reloads the current deidentified reservation state instead of returning a stale cached confirmation. Response stored is allowlisted and contains no credential. Request hashes may contain keyed digests of contact fields; never persist raw public body. Store the hash-key version and retain verification keys for the required replay lifetime when rotating secrets. Reject reused known key with altered body even after cache cleanup where domain retains key hash.

PATCH and state commands require `expectedVersion`; stale version409 includes only currentVersion and accessible resource ID in error details, so UI can refetch. Immutable creates do not require versions. Same body and expectedVersion under a new key does not authorize duplicate posting: receipt/stock-count/source uniqueness remains permanent.

## 3. Shared DTOs

Read DTOs include `id`, `version` on mutable records, `createdAt`, `updatedAt`, and relevant fields named below. Audit/PII are permission-filtered, not arbitrary `include=*` options.

| DTO | Required additional fields |
| --- | --- |
| `Ingredient` | name, baseUnit:`G\|ML\|EACH`, archivedAt:null\|Instant, reorderLevel:Qty, defaultSupplierId:null\|ID, currentCost:null\|{rate:Rate,basisId:ID,effectiveAt:Instant}, balance:null\|{quantity:Qty,isEstimate:true,lastCountAt:null\|Instant,anchorCountLineId:null\|ID,needsOpeningCount:boolean}, lowStock:null\|boolean. Null balance means not available; never invent zero before the inventory service exists. |
| `Supplier` | name, contactName:null\|string, email:null\|string, phone:null\|string, leadTimeDays:0..365, notes:null\|string, archivedAt:null\|Instant |
| `Package` | ingredientId,supplierId,label,supplierSku:null\|string,baseQuantity:Qty,estimatedPackCostCents:null\|Cents,archivedAt:null\|Instant |
| `Recipe` | name,kind:`BASE\|MODIFIER`,archivedAt, latestDraft:null\|RecipeVersion, activeVersion:null\|RecipeVersion |
| `RecipeVersion` | recipeId,versionNumber,status,effectiveFrom:null\|Instant,effectiveTo:null\|Instant,yieldServings:Qty,components:Component[],cost:{status:`KNOWN\|PARTIAL\|UNKNOWN`,perServingCents:null\|Cents,missingIngredientIds:ID[]},publishedAt:null\|Instant |
| `Component` | ingredientId,quantityBase:Qty,lossFraction:Fraction,direction:`ADD\|SUBTRACT`,position:int |
| `PurchaseOrder` | number,supplierId,status,expectedDeliveryDate:null\|date,notes,lines:{id,ingredientId,packageId:null\|ID,orderedBaseQuantity:Qty,receivedBaseQuantity:Qty,estimatedTotalCents:null\|Cents,packageSnapshot:null\|object}[] |
| `Receipt` | supplierId,purchaseOrderId:null\|ID,status,receivedAt,postedAt:null\|Instant,taxCents,deliveryCents,otherFeeCents,reason:null\|string,lines:{id,ingredientId,purchaseOrderLineId:null\|ID,actualBaseQuantity:Qty,actualTotalCents:Cents}[],reversalOfReceiptId:null\|ID |
| `StockMovement` | ingredientId,quantityBase:Qty,type,sourceType,sourceId,effectiveAt,postedAt,reason:null\|string,coveredByCount:boolean,actor:{kind,id:null\|ID} |
| `StockCount` | status,countedAt:null\|Instant,lines:{ingredientId,actualQuantity:Qty,expectedQuantity:null\|Qty,variance:null\|Qty}[],postedAt:null\|Instant |
| `Table` | label,capacity:1..100,active:boolean,archivedAt:null\|Instant |
| `Combination` | name,tableIds:ID[2..6],capacity:2..100,active:boolean; capacity is explicitly configured, not inferred from sum |
| `ReservationStaff` | reference,name,email:null\|string,phone:null\|string,partySize,startsAt,endsAt,seatedAt:null\|Instant,status,tableIds:ID[],notes:null\|string,source:`PUBLIC\|STAFF\|WAITLIST`,privacyAcceptedAt,marketingOptIn:boolean |
| `WaitlistEntry` | name,email:null\|string,phone:null\|string,partySize,joinedAt,estimatedWaitMinutes:null\|int,status,notes:null\|string,reservationId:null\|ID |
| `JobStatus` | id,kind,state,attempts,nextAttemptAt:null\|Instant,sanitizedErrorCode:null\|string,createdAt,completedAt:null\|Instant |
| `ConnectionStatus` | environment,merchantId:null\|string,locationId:null\|string,status,apiVersion,sdkVersion,verifiedAt:null\|Instant,streams:{entity,lastIngestedAt,lastProjectedAt:null\|Instant,ageSeconds:null\|int,status}[],openIssueCount,queuedJobCount; no secret ref/value |

## 4. Identity and settings routes

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/csrf` | O M H I V | none | `{csrfToken:string}`; authenticated same-origin/no-store. Random 32-byte synchronizer token belongs to the current database session; compare X-CSRF-Token constant-time on custom staff writes. Rotate on login; legacy sessions without token require reauthentication. |
| GET `/me` | O M H I V | none | `{user:{id,name,email},role,location:{id,name,timezone},permissions:string[],lastAuthenticatedAt}`. No membership =>403 except auth signout. |
| GET `/settings` | O M | none | `{restaurant:{name,slug,currency},location:{name,timezone,businessDayCutoff},version}`; no secrets. |
| PATCH `/settings` | O | `{expectedVersion,name?:Text(120),locationName?:Text(120)}` | Updated settings. Timezone/cutoff changes use separate prospectively effective policy command, not this patch. |
| POST `/settings/business-day-policy` | O fresh login | `{expectedVersion,timezone:Text(80),cutoff:"HH:mm",effectiveFrom:Instant,reason:Text(500)}` | Policy DTO; future instant only, does not rewrite stored business dates. |
| GET `/memberships` | O | list params | `{id,user:{id,name,email},role,status,locationIds,version}[]`. |
| POST `/memberships` | O fresh login | `{email,role,locationIds:ID[1],name?:Text(120)}` | Created INVITED membership + notification job. Reject an existing active membership409. |
| PATCH `/memberships/{id}` | O fresh login | `{expectedVersion,role?,status?:ACTIVE\|DISABLED,locationIds?:ID[1],reason:Text(500)}` | Updated membership; last-owner guard; revoke sessions on disable. Invite acceptance transitions INVITED to ACTIVE only after verified email identity. |
| GET `/audit` | O | cursor, entityType?,entityId?,from?,to? max90days | Allowlisted audit rows, no guest contact or credentials. |

## 5. Square read-only integration and recovery routes

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/integrations/square/status` | O M | none | ConnectionStatus. M sees status, not credential configuration. |
| POST `/integrations/square/configure` | O fresh login | `{environment:SANDBOX\|PRODUCTION,merchantId:SquareID,squareLocationId:SquareID,credentialAlias:literal "SQUARE_ACCESS_TOKEN",expectedVersion:Version\|null,reason:Text(500)}` |202 `{jobId}` connection validation. Null expectedVersion only for first creation; existing configuration requires its version. Credential alias is fixed deployment secret lookup; no arbitrary filesystem/secret path. Switching merchant/environment with existing imports409 requires explicit operator migration. |
| POST `/integrations/square/test` | O | `{}` | `{ok:boolean,code:null\|string,merchantName:null\|string,locations:{squareId,name,currency}[],apiVersion,sdkVersion}`; timeout10s, no persistence of failed token payload. |
| POST `/integrations/square/sync` | O | `{mode:INCREMENTAL\|BACKFILL\|RECONCILE,from?:BusinessDate,to?:BusinessDate}` |202 `{runId,jobId}`. Dates required for BACKFILL/RECONCILE; max366days; initial default90days; no source write. |
| GET `/integrations/square/runs` | O M | list,status? | SyncRun summaries: id,kind,status,windowStart,windowEnd,counts,errorCode,startedAt,finishedAt. |
| GET `/integrations/square/runs/{id}` | O M | none | SyncRun + JobStatus[] + issues, all redacted. |
| GET `/integrations/square/catalog` | O M | list,type?,deleted?,mappingState? | id,squareId,type,name,version:string,isDeleted,locationAvailable,mappingState. |
| GET `/integrations/square/orders` | O M | list,from,to,state? | id,squareId,state,closedAt,businessDate,totalCents,currency,quality,projectionStatus. |
| GET `/integrations/square/orders/{id}` | O M | none | Normalized order, own lines/modifiers, return links, linked payment/refund summaries, projection and issues; no card/customer payload. |
| GET `/operations/jobs` | O | list,state?,kind? | JobStatus[]. |
| POST `/operations/jobs/{id}/retry` | O | `{reason:Text(500)}` |202 `{jobId}`; retry only DEAD/failed transient tasks after cause addressed, retain source dedupe. |
| POST `/operations/projection-replays/preview` | O | `{from,to,reason:Text(500)}` |202 `{previewRunId}`; snapshot diff includes costs, current vs count-covered usage, affected records. No mutation yet. |
| GET `/operations/projection-replays/{id}` | O | none | `{id,state,inputFingerprint,affectedCount,costDeltaCents,currentStockDeltas,coveredStockDeltas,expiresAt}`. |
| POST `/operations/projection-replays/{id}/execute` | O fresh login | `{inputFingerprint,reason:Text(500)}` |202 `{runId}`; stale/expired preview409; bounded replay preserves old snapshots. |

Webhook: POST `/api/webhooks/square`, no session/CSRF. Require exact raw body HMAC and configured URL; verify before JSON processing. Valid known/duplicate event200 `{received:true}` after durable persistence; signed irrelevant event200 and IGNORED audit metadata; invalid signature400; invalid signed JSON400; temporarily failed persistence503. Unknown merchant/application is rejected400 with generic error, not attached to default tenant. Event payload fields are not trusted as credentials or redirect targets.

Optional scheduler endpoint POST `/api/internal/schedules/tick`: constant-time `Authorization: Bearer CRON_SECRET`, no cookie identity, no body;202 `{enqueuedCount}`. It only deduplicates due durable jobs, never executes a backfill in the request. The primary scheduler is the worker, so cron duplication remains safe.

## 6. Ingredients, suppliers, recipes and mappings

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/ingredients`, GET `/ingredients/{id}` | O M I | list,archived?,lowStock? | Ingredient list/detail. |
| POST `/ingredients` | O M I | `{name:Text(120),baseUnit:G\|ML\|EACH,reorderLevel:nonnegative Qty,defaultSupplierId?:ID}` | Ingredient; creating requires an active scoped location record. |
| PATCH `/ingredients/{id}` | O M I | `{expectedVersion,name?,reorderLevel?,defaultSupplierId?:ID\|null,archive?:boolean}` | Ingredient. Unit change unsupported once referenced; archive with usage preserves history. |
| GET `/suppliers`, GET `/suppliers/{id}` | O M I | list,archived? | Supplier list/detail. |
| POST `/suppliers` | O M I | `{name:Text(120),contactName?:Text(120),email?,phone?,leadTimeDays?:int,notes?}` | Supplier. |
| PATCH `/suppliers/{id}` | O M I | `{expectedVersion,name?,contactName?,email?,phone?,leadTimeDays?,notes?,archive?:boolean}` | Supplier; optional fields accept null to clear. |
| GET `/ingredients/{id}/packages` | O M I | list | Package[]. |
| POST `/ingredients/{id}/packages` | O M I | `{supplierId,label:Text(120),supplierSku?:Text(100),baseQuantity:positive Qty,estimatedPackCostCents?:Cents}` | Package. User must express actual ingredient base unit; never infer density. |
| PATCH `/packages/{id}` | O M I | `{expectedVersion,label?,supplierSku?,baseQuantity?,estimatedPackCostCents?,archive?:boolean}` | Package; old PO/receipt snapshots immutable. |
| POST `/ingredients/{id}/cost-bases` | O M | `{costPerBaseUnit:Rate,effectiveAt:Instant,reason:Text(500)}` | `{id,ingredientId,rate,effectiveAt,source:"OPENING_COST"}`. Historical manual basis does not silently recost published snapshots; creates exception/preview need. |
| GET `/recipes`, GET `/recipes/{id}` | O M | list,kind?,mappingState? | Recipe list/detail, including cost unknown reasons. |
| POST `/recipes` | O M | `{name:Text(120),kind:BASE\|MODIFIER}` | Recipe with empty draft. |
| PATCH `/recipes/{id}` | O M | `{expectedVersion,name?,archive?:boolean}` | Recipe; archive prevents future mapping, retains versions. |
| POST `/recipes/{id}/versions` | O M | `{cloneVersionId?:ID}` | Draft RecipeVersion (clone immutable version or empty). Only one editable draft per recipe. |
| PATCH `/recipe-versions/{id}` | O M | `{expectedVersion,yieldServings:positive Qty,components:Component[0..100],notes?}` | Draft RecipeVersion. Empty draft can be saved; publication requires at least one component (use NO_EFFECT mapping instead of empty modifier recipe). BASE permits ADD only; MODIFIER yield1 and signed direction. Reject duplicate ingredient+direction. |
| POST `/recipe-versions/{id}/publish` | O M | `{expectedVersion,effectiveFrom?:Instant,reason:Text(500)}` | Published RecipeVersion. Omitted effectiveFrom means transaction server now; a supplied value must be future. Reject empty/structurally invalid components and negative base quantities. MODIFIER SUBTRACT deltas are valid; validate final demand when applied to a base recipe, never reject a modifier merely because its effect is subtractive. Unknown ingredient cost may publish with an explicit warning. |
| GET `/recipe-mappings` | O M | list,kind?,unmapped? | Mapping DTO {id,catalogSquareId,kind,recipeId:null,effect:NO_EFFECT\|RECIPE,effectiveFrom,effectiveTo,version}. |
| POST `/recipe-mappings` | O M | `{catalogSquareId,kind:VARIATION\|MODIFIER,effect:RECIPE\|NO_EFFECT,recipeId?:ID,effectiveFrom?:Instant,reason:Text(500)}` | Mapping; default transaction server now, supplied future only. NO_EFFECT allowed for modifier only, requires explicit acknowledgement. One interval per source object; mappings never made by name. |
| POST `/recipe-mappings/{id}/end` | O M | `{expectedVersion,effectiveTo:Instant,reason:Text(500)}` | Mapping with closed interval; future/current only. |

Current recipe preview uses latest known cost and labels its timestamp; historical sale snapshots pin prior rates. The schema permits recorded zero ingredient cost and missing cost separately. Mapping changes enqueue applicable new projections; historic remapping requires owner preview/replay endpoints.

## 7. Purchasing and inventory

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/purchase-orders`, GET `/purchase-orders/{id}` | O M I | list,status?,supplierId? | PurchaseOrder list/detail. |
| POST `/purchase-orders` | O M I | `{supplierId,expectedDeliveryDate?,notes?,lines:[{ingredientId,packageId?,orderedBaseQuantity:positive Qty,estimatedTotalCents?:Cents}][1..100]}` | DRAFT PurchaseOrder. Package conversion and price are snapshotted. |
| PATCH `/purchase-orders/{id}` | O M I | `{expectedVersion,expectedDeliveryDate?,notes?,lines?:sameAsCreate}` | Draft edit. ORDERED quantity amendment uses command below; received lines cannot be erased. |
| POST `/purchase-orders/{id}/transition` | O M I | `{expectedVersion,action:ORDER\|CANCEL\|CLOSE_SHORT,reason?:Text(500)}` | PurchaseOrder. CANCEL only before any receiving; CLOSE_SHORT requires reason. Receipt-driven statuses are not client-set. |
| POST `/purchase-orders/{id}/amend-quantities` | O M I | `{expectedVersion,lines:[{id,orderedBaseQuantity:positive Qty}],reason:Text(500)}` | PurchaseOrder; cannot reduce below posted nonreversed received quantity. Allows explicit overdelivery preparation. |
| GET `/receipts`, GET `/receipts/{id}` | O M I | list,purchaseOrderId?,supplierId? | Receipt list/detail. |
| POST `/receipts` | O M I | `{supplierId,purchaseOrderId?:ID,supplierDocumentRef?:Text(100),taxCents?:nonnegative Cents,deliveryCents?:nonnegative Cents,otherFeeCents?:nonnegative Cents,lines:[{ingredientId,purchaseOrderLineId?:ID,actualBaseQuantity:positive Qty,actualTotalCents:nonnegative Cents}][1..100]}` | DRAFT Receipt; fee fields default zero, are separately reported and excluded from ingredient cost basis. No stock/cost effect until post. Ad hoc receipts allowed with no PO. |
| PATCH `/receipts/{id}` | O M I | `{expectedVersion,supplierDocumentRef?,taxCents?,deliveryCents?,otherFeeCents?,lines:[{ingredientId,purchaseOrderLineId?:ID,actualBaseQuantity:positive Qty,actualTotalCents:nonnegative Cents}][1..100]}` | Draft-only full line replacement; fee fields nonnegative. Posted receipt409 INVALID_TRANSITION. Supplier/PO identity fixed after draft creation. |
| POST `/receipts/{id}/post` | O M I | `{expectedVersion}` | Receipt POSTED; receipt/lines immutable, server receivedAt/postedAt; transaction inserts stock/cost/audit and updates PO status. Reject overreceipt409; quantities correspond to PO ingredient/supplier. |
| POST `/receipts/{id}/reverse` | O M I | `{expectedVersion,reason:Text(500)}` | `{receipt:Receipt,reversalReceiptId}`. Exact opposite stock, restore PO outstanding, invalidate cost prospectively; repeated call cannot create second reversal. Replacement is new draft receipt. |
| POST `/inventory/waste` | O M I | `{ingredientId,quantityBase:positive Qty,reasonCode:SPOILAGE\|PREP_ERROR\|DAMAGE\|OTHER,notes?:Text(500)}` | StockMovement negative quantity; OTHER requires notes. Date is server posting time. |
| POST `/inventory/adjustments` | O M I | `{ingredientId,quantityBase:nonzero signed Qty,reason:Text(500),sourceMovementId?:ID}` | StockMovement; recoverable returned ingredient explicitly recorded here, with no automatic refund link behavior. |
| GET `/inventory/movements` | O M I | list,ingredientId?,type?,from?,to? | StockMovement list; distinguish effective vs posted times and count-covered history. |
| GET `/inventory/balances` | O M I | list,lowStock? | `{ingredientId,name,baseUnit,quantityBase,lastCountAt,anchorCountLineId:null\|ID,needsOpeningCount,isEstimate:true,reorderLevel,lowStock}[]`. |
| GET `/inventory/stock-counts`, GET `/inventory/stock-counts/{id}` | O M I | list,status? | StockCount list/detail. |
| POST `/inventory/stock-counts` | O M I | `{lines:[{ingredientId,actualQuantity:nonnegative Qty}][1..200]}` | DRAFT StockCount, no balance change; duplicates ingredient rejected. |
| PATCH `/inventory/stock-counts/{id}` | O M I | `{expectedVersion,lines:sameAsCreate}` | DRAFT StockCount; whole line replacement only while draft. |
| POST `/inventory/stock-counts/{id}/post` | O M I | `{expectedVersion,physicalOperationsPausedAcknowledged:true}` | POSTED StockCount with locked expected/actual/variance and server countedAt. No backdate. Reposting under any key cannot adjust twice. |

No API updates posted ledger quantities, posted receipt lines, or posted count actuals. A mistaken count is corrected with a new count; old anchor/history remains. Canceled draft records can be archived by the service, not hard-delete history. Negative stock warnings accompany200/201 rather than changing sale/receipt acceptance.

## 8. Reservation, table and waitlist contracts

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/tables`, GET `/table-combinations` | O M H | list,active? | Table[] / Combination[]. |
| POST `/tables` | O M | `{label:Text(40),capacity:int1..100}` | Table. |
| PATCH `/tables/{id}` | O M | `{expectedVersion,label?,capacity?,active?}` | Table; deactivation/reduced capacity with affected future claims409. |
| POST `/table-combinations` | O M | `{name:Text(80),tableIds:ID[2..6],capacity:int2..100}` | Combination. No duplicate tables. Capacity cannot exceed sum of members; may be lower. |
| PATCH `/table-combinations/{id}` | O M | `{expectedVersion,name?,tableIds?,capacity?,active?}` | Combination; validate future reservations before changing. |
| GET `/booking-settings` | O M H | none | `{version,timezone,published,leadMinutes,advanceDays,slotMinutes,durationMinutes,bufferBeforeMinutes,bufferAfterMinutes,cleanupAfterCloseAllowed,maxPublicParty,bookingTermsVersion,privacyNoticeUrl,contactPhone,openingHours,blocks}`. H readonly. |
| PATCH `/booking-settings` | O M | `{expectedVersion,published?,leadMinutes?:int0..1440,advanceDays?:int1..365,slotMinutes?:15\|30,durationMinutes?:int15..360,bufferBeforeMinutes?:int0..60,bufferAfterMinutes?:int0..120,cleanupAfterCloseAllowed?:boolean,maxPublicParty?:int1..20,bookingTermsVersion?:Text(40),privacyNoticeUrl?:Text(500),contactPhone?:string\|null,openingHours?:[{weekday:0..6,opens:"HH:mm",closes:"HH:mm",endsNextDay:boolean}],blocks?:[{from:Instant,to:Instant,reason:Text(120)}]}` | Settings; publication requires configured terms/privacy/contact instructions. Privacy URL is same-origin relative path or explicit HTTPS URL, never fetched by server. Validate overlap and current bookings under same allocator lock; empty hours means closed. DST slot instants follow ARCHITECTURE. |
| GET `/reservations` | O M H | businessDate required,status?,cursor,limit | ReservationStaff[]. Default filters include all statuses; canceled visual distinction. |
| GET `/reservations/{id}` | O M H | none | ReservationStaff. |
| POST `/reservations` | O M H | `{name:Text(120),email?,phone?,partySize:int1..100,startsAt:Instant,durationMinutes?:int15..360,tableIds?:ID[1..6],notes?,privacyAccepted:true,marketingOptIn?:boolean}` | ReservationStaff CONFIRMED, source STAFF. At least one contact required. Explicit tableIds must be one active table or an exact active approved combination, never an arbitrary capacity sum. No capacity/overlap bypass. |
| POST `/reservations/walk-ins` | O M H | `{name:Text(120),partySize:int1..100,durationMinutes?:int15..360,tableIds?:ID[1..6],notes?,privacyAccepted:true}` | ReservationStaff SEATED, source STAFF, startsAt=server now; contact optional. Public lead/horizon rules do not apply; hours, capacity and overlap still apply. Audit WALK_IN_SEATED. |
| PATCH `/reservations/{id}` | O M H | `{expectedVersion,name?,email?,phone?,partySize?,startsAt?,durationMinutes?,tableIds?,notes?}` | ReservationStaff; atomic reallocation failure keeps old claim. |
| POST `/reservations/{id}/transition` | O M H | `{expectedVersion,action:SEAT\|COMPLETE\|CANCEL\|NO_SHOW,reason?:Text(500)}` | ReservationStaff. SEAT only CONFIRMED; records seatedAt=server now and expands occupancy start to min(startsAt,seatedAt), expected end to max(endsAt,seatedAt+duration), with buffers. Extension conflict409 leaves status/claim unchanged. COMPLETE only SEATED and is staff acknowledgment that the table is cleared and ready (releases cleanup claim); CANCEL only CONFIRMED; NO_SHOW only CONFIRMED at/after startsAt. Terminal cannot reopen. |
| GET `/reservations/availability` | O M H | `startsAt`,partySize,durationMinutes? | `{candidates:[{tableIds,capacity,startsAt,endsAt}],settingsVersion}`; staff only. Static route must take precedence over `{id}`. |
| GET `/waitlist` | O M H | businessDate,status?,list | WaitlistEntry[]. |
| POST `/waitlist` | O M H | `{name:Text(120),email?,phone?,partySize:int1..100,estimatedWaitMinutes?:int0..360,notes?,privacyAccepted:boolean}` | WAITING WaitlistEntry. Contact optional for present walk-in. |
| PATCH `/waitlist/{id}` | O M H | `{expectedVersion,estimatedWaitMinutes?,notes?,action?:NOTIFY\|CANCEL\|LEAVE}` | WaitlistEntry; NOTIFY moves WAITING to NOTIFIED without sending SMS; CANCEL moves WAITING/NOTIFIED to CANCELED; LEAVE moves WAITING/NOTIFIED to LEFT. Terminal entries cannot be notified or seated. |
| POST `/waitlist/{id}/seat` | O M H | `{expectedVersion,durationMinutes?:int15..360,tableIds?:ID[1..6]}` | `{waitlist:WaitlistEntry,reservation:ReservationStaff}` atomically allocates now and transitions reservation to SEATED. |

An active seating claim is separate from the planned finite interval: a physical table cannot have two SEATED reservations even when their planned windows do not overlap. SEAT returns 409 TABLE_OCCUPIED if another reservation is still seated. A table whose SEATED reservation is past its expected end is conservatively excluded from new availability/allocations until the host extends, reassigns or clears it; existing future confirmed bookings remain and show a conflict warning. No automatic table release occurs.

Public routes below have **no staff cookie requirement** and return no names, table IDs, contact lists or Square information. `restaurantSlug` resolves published restaurant and its one location. Public requests cannot choose restaurant UUID/location or duration. They use same capacity allocator as staff.

| Method/public path | Request | Response |
| --- | --- | --- |
| GET `/api/public/{slug}/restaurant` | none | `{name,timezone,bookingTermsVersion,privacyNoticeUrl,maxPartySize,advanceDays,contactPhone:null\|string}`; only configured published facts. |
| GET `/api/public/{slug}/availability` | `date:YYYY-MM-DD`,partySize:int1..maxPublicParty | `{date,timezone,settingsVersion,slots:[{startsAt:Instant,endsAt:Instant,label:string,utcOffset:string}]}`. No capacity counts/table IDs or guest data. Empty slots200. |
| POST `/api/public/{slug}/reservations` | `{name:Text(120),email?,phone?,partySize:int,startsAt:Instant,privacyAccepted:true,termsVersion:Text(40),marketingOptIn?:false\|true,website?:""}` and Idempotency-Key |201 `{reference:string,status:ReservationStatus,partySize,startsAt,endsAt,timezone,contactInstructions:string,replayed:false}`; initial status is CONFIRMED. Same-key replay is 200 with replayed:true and current status (including CANCELED/NO_SHOW/COMPLETED), even after contact redaction. No guest lookup endpoint. Host manages later changes/cancellation. |

Public availability limit60/min/IP-hash and300/min/location; booking5/15min/IP-hash,3/hour/contact-hash,100/hour/location. Rate-limited create429 never inserts a booking. Honeypot nonempty rejects generic422 with no booking; never fake success. Trusted proxy config governs IP extraction; do not trust arbitrary X-Forwarded-For. Cap availability horizon/date complexity. Contact collection requires at least email or phone; terms version must match current publication. Staff receives no public idempotency key. Retain a permanent domain booking-request key hash tied to resource/reference so a replay after response-cache expiry can return existing non-PII confirmation with its current status rather than book another table; retention cleanup does not create a fresh claim. Resolve a valid existing permanent key before create-only lead-time/contact-rate checks, so retry of an already completed operation does not fail just because its start time is now past; still enforce general abuse limits and body-hash equality. ReservationStatus is CONFIRMED, SEATED, COMPLETED, CANCELED, or NO_SHOW.

## 9. Refunds, reconciliation, reports and exports

`Quality` DTO: `{status:COMPLETE|PARTIAL|STALE|UNAVAILABLE,sourceAsOf:null|Instant,projectedAsOf:null|Instant,unmappedLineCount:int,unknownCostLineCount:int,unallocatedRefundCents:Cents,knownRevenueCoverageBps:null|int0..10000,warnings:{code,message}[]}`. Coverage denominator explicitly excludes non-menu lines; if denominator0 return coverage null, not100%. Percent values are decimal strings to four places or null (not JSON floats). Monetary null always carries reason/quality. Refund business date is source creation date once completed, not import date.

| Method/path | Roles | Request | Response / behavior |
| --- | --- | --- | --- |
| GET `/refunds` | O M | list,from,to,allocationState? | id,squareId,status,amountCents,businessDate,allocationState,linkedOrderId:null\|ID,version. |
| POST `/refunds/{id}/allocations` | O M | `{expectedVersion,menuCents,taxCents,tipCents,serviceCents,otherCents,lines?:[{orderId,squareLineUid,menuCents}],reason:Text(500)}` | `{refundId,allocationRevision,allocationState:"ALLOCATED",...parts}`; COMPLETED only, sum exactly amount; optional line totals<=menu and same sale links. Revision append/audit, never alter source refund. |
| GET `/reconciliation/issues` | O M | list,state?,severity?,kind? | Sanitized issue DTO including expected/actual cents, source references, first/last seen, resolution. |
| POST `/reconciliation/issues/{id}/acknowledge` | O M | `{expectedVersion,reason:Text(500)}` | Issue ACKNOWLEDGED. Acknowledgement is not numeric reconciliation. |
| POST `/reconciliation/issues/{id}/recheck` | O M | `{expectedVersion}` |202 `{jobId}`; only engine resolves once source evidence reconciles. |
| GET `/reports/sales` | O M V | from,to,groupBy?:DAY\|VARIATION | `{bounds,totals:{grossMenuSalesCents,discountCents,menuBeforeRefundsCents,allocatedMenuRefundCents,netMenuSalesCents:null\|Cents,taxCents,tipCents,serviceCents,completedCollectionsCents,completedRefundCents},rows,quality}`. Rows have businessDate/variation key,label,soldQty,returnedQty separately, menu amounts,quality. |
| GET `/reports/food-cost` | O M V | from,to,groupBy?:VARIATION\|DAY | `{bounds,totals:{theoreticalCostCents:null\|Cents,knownCostCents,knownSubsetRevenueCents,foodCostPercent:null\|string,contributionMarginCents:null\|Cents,knownSubsetFoodCostPercent:null\|string},rows,quality}`. Rows include recipe mapping/coverage/missing reasons; prepared quantities separate returned quantities. |
| GET `/reports/purchasing` | O M V | from,to,supplierId? | `{bounds,grossReceivedCents,reversedCents,netReceivedCents,rows:[{supplierId,name,grossReceivedCents,reversedCents,netReceivedCents}],quality}`. Original receipt spend stays on original posted date; reversal amount is recognized on its own posting date. Net=gross-reversed; reversal cents displayed nonnegative. |
| GET `/reports/inventory` | O M I | from,to | `{bounds,waste:[{ingredientId,quantityBase,costCents:null\|Cents}],countVariances,lowStock,quality}`; waste costs pin basis at posting. |
| GET `/dashboard` | O M V | from,to | Composes sales/cost summaries, daily trend, top variations, current lowStockCount, openIssueCount and per-stream quality. V receives aggregates, not supplier/guest contacts or payment details. |
| POST `/exports` | O M H I V with per-kind permission | `{kind:SALES\|FOOD_COST\|PURCHASING\|INVENTORY\|HOST_SHEET,from,to}` |202 `{exportId,jobId}`. I only INVENTORY/PURCHASING; V SALES/FOOD_COST/PURCHASING; HOST_SHEET only O M H, contact export also fresh login; H has no access to general reports. |
| GET `/exports/{id}` | same initiating user still permitted | none | `{id,state,downloadUrl:null\|string,expiresAt:null\|Instant,rowCount:null\|int}`. URL is same-origin authenticated `/api/v1/exports/{id}/download`, never public storage URL. |
| GET `/exports/{id}/download` | same initiating user still permitted | none | CSV bytes; audit download, attachment filename, UTF-8, RFC4180 quoting, formula-prefix escaping for untrusted text cells beginning =,+,-,@,tab,CR; strictly validated generated numeric cells preserve their numeric representation. No credentials. Private/no-store; expires24h (host PII export1h). |
| GET `/operations/health` | O | none | Redacted per-stream freshness, worker heartbeat, queue/dead counts, backup last drill metadata, release IDs. |

Export file storage is private managed object storage or encrypted bounded DB blob for small exports (v1 choose bounded DB blob max10MiB, max50k rows; above bounds422 with request to narrow range). Never hold a route request open to generate large reports. Host sheet covers one service date and includes reservation reference, time, name, party, tables and necessary contact only; notes require explicit owner/manager opt-in and are excluded by default. Staff PDF/CSV guest sheets must be handled as private material.

Public GET `/api/health` returns `{status:"ok"}`200 or generic503, without private operational fields. Every DTO and error path must have a contract test. New fields must be additive unless versioned; client tests must demonstrate handling unknown Square states without changing financial totals.
