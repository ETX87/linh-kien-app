# Production System Audit Report

Audit date: 2026-09-05  
Scope: static repository audit only. Production network/database metrics were not available, therefore runtime claims are marked `NEED MORE EVIDENCE`.

## Architecture

- Cloudflare Worker using Hono (`backend/src/index.ts`), serving Vite static assets and `/api/*`.
- Cloudflare D1/SQLite via `c.env.DB`; migrations in `migrations/`.
- Cookie JWT session, DB-backed user/role flags, server-side middleware authorization.
- Hourly cron invokes DVBH sync through Cloudflare service bindings. Google Drive and Web Push are external integrations.
- React frontend with local/IndexedDB caches and server API calls.

## Findings

### AUD-001
Severity: P1  
Confidence: CONFIRMED  
Title: Admin users endpoint still supports unbounded reads and `SELECT *`  
Area: Database/API/performance  
File: `backend/src/routes/users.ts`  
Line: 68-70  
Current behavior: When `page` is omitted, the Admin-only endpoint executes `SELECT * FROM users ... .all()` and returns every matching user.  
Expected behavior: Enforce a bounded page size and select only fields required by the UI.  
Impact: Response and D1 read cost grow linearly with user count; sensitive columns are unnecessarily serialized.  
Evidence: Explicit no-page branch at lines 68-70; paginated branch exists immediately below, showing the safer pattern.  
Recommended solution: Remove compatibility branch after frontend migration, default to bounded pagination, replace `*` with an allow-list, and add a maximum result contract.  
Estimated complexity: Low.

### AUD-002
Severity: P1  
Confidence: CONFIRMED  
Title: Several bulk workflow operations perform sequential per-ID database work  
Area: Database/concurrency/performance  
File: `backend/src/routes/datMuaLinhKien.ts`, `backend/src/routes/traHang.ts`  
Line: `datMuaLinhKien.ts:2564`, `traHang.ts:381`  
Current behavior: Bulk requests are capped at 100 IDs, but each ID is still processed in a sequential loop with multiple reads/writes.  
Impact: A single page-sized action can consume hundreds of D1 operations, increase latency, and leave partial completion if a later ID fails.  
Evidence: `for (const donHangId of ids)` after the `MAX_BULK_IDS = 100` guard.  
Recommended solution: Validate all IDs and current states first, use D1 batch/transaction-compatible statements, return per-ID results, and make retries idempotent.  
Estimated complexity: Medium.

### AUD-003
Severity: P2  
Confidence: CONFIRMED  
Title: Settings bulk import contains query-in-loop and external fetch-in-loop patterns  
Area: Database/integration/performance  
File: `backend/src/routes/settingsDatMua.ts`  
Line: 183-198, 300-321  
Current behavior: Import processing loops rows, checks existence individually, and fetches image URLs while processing rows.  
Impact: Large imports amplify D1 round trips and external latency; failures can produce partial imports and long Worker execution.  
Recommended solution: Preload keys in chunks, batch writes, bound/validate image fetches, and expose import results per row.  
Estimated complexity: Medium.

### AUD-004
Severity: P2  
Confidence: LIKELY  
Title: Frontend public-sheet path disables HTTP caching  
Area: Network/performance  
File: `frontend/src/lib/publicSheetCache.ts`  
Line: 124  
Current behavior: Browser fetch uses `{ cache: "no-store" }`; an IndexedDB cache exists but every hook load still depends on application cache behavior.  
Impact: Repeated navigation can increase bandwidth and latency; runtime request frequency requires production metrics.  
Recommended solution: Use versioned cache headers/ETag or stale-while-revalidate and instrument cache hit/miss/request counts.  
Estimated complexity: Low.

### AUD-005
Severity: P2  
Confidence: POTENTIAL  
Title: Latest-status correlated subqueries can become expensive at list scale  
Area: Database/performance  
File: `backend/src/routes/datMuaLinhKien.ts`, `backend/src/routes/phieuXuatKho.ts`  
Line: status expression helpers near the top of each file  
Current behavior: List/report queries repeatedly execute `ORDER BY id DESC LIMIT 1` correlated subqueries against log tables.  
Impact: Cost depends on row count and index selectivity; exact waste is `NEED MORE EVIDENCE` without D1 query plans/metrics.  
Recommended solution: Capture `EXPLAIN QUERY PLAN`, verify composite indexes `(foreign_key, id DESC)`, and consider materialized current status with atomic updates.

### AUD-006
Severity: P1  
Confidence: POTENTIAL  
Title: Workflow state transitions need runtime proof of atomicity under concurrent approval/export  
Area: Business correctness/concurrency  
File: `backend/src/routes/datMuaLinhKien.ts`, `backend/src/routes/phieuXuatKho.ts`  
Current behavior: Entities carry a `version` column and latest-log state, but this audit did not establish that every transition uses an atomic compare-and-swap/transaction.  
Impact: Concurrent approve/export or inventory updates could duplicate work or oversubscribe stock.  
Required evidence: Concurrent replay against production-like D1 with two requests and resulting logs/stock.  
Recommended solution: Enforce `WHERE version = ?` or atomic state predicates, unique business keys, and transaction/batch boundaries for state plus side effects.

### AUD-007
Severity: P2  
Confidence: CONFIRMED  
Title: Error responses are generic at the Worker boundary  
Area: Observability/error handling  
File: `backend/src/index.ts`  
Line: 37-40  
Current behavior: Unhandled errors are logged server-side and returned only as `{ error: "INTERNAL_ERROR" }`.  
Impact: Users cannot distinguish retryable conflicts, validation failures, or dependency outages; correlation/tracing is absent from the response contract.  
Recommended solution: Add request/correlation IDs, structured error classes/status mapping, and safe user-facing error codes while retaining sensitive details only in logs.

## TOP 10 ISSUES

1. Unbounded Admin user read (`AUD-001`).
2. Sequential bulk mutations and partial-failure risk (`AUD-002`).
3. Import query/fetch loops (`AUD-003`).
4. Missing runtime concurrency proof for approval/export/inventory (`AUD-006`).
5. Generic untraceable client error contract (`AUD-007`).
6. Repeated latest-log correlated subqueries (`AUD-005`).
7. No-store public-sheet requests (`AUD-004`).

## QUICK WINS

- Default all list endpoints to bounded pagination and explicit columns.
- Add correlation IDs and structured error codes.
- Instrument API count, duration, payload bytes, cache hit/miss, and D1 duration.
- Verify/add composite log indexes using query plans.

## MAJOR FIXES

- Redesign bulk transitions around atomic batch/transaction semantics.
- Establish a single current-state/optimistic-lock contract for order, PXK, return, and inventory workflows.

## PRODUCTION RISKS

- Data waste and latency increase with user/import/list growth.
- Concurrent state transitions may be incorrect until replay-tested.
- Runtime API/query waste, cache hit rate, and actual response sizes are unknown.

## REQUIRED MONITORING

- Per-route request count, p50/p95 latency, status code, payload bytes.
- D1 query duration, rows read, query-plan regressions, Worker CPU/timeouts.
- Bulk success/partial-failure counts and idempotency conflicts.
- Cache hit/miss and external service failure/latency.

## Audit conclusion

The repository has meaningful server-side authentication, role middleware, pagination in newer paths, bulk limits, indexes, and service bindings. It is not possible to certify production correctness or cost from static code alone. No production code was modified and no deployment was performed.
