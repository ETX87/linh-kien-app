# Performance Audit

## Confirmed/likely hotspots

1. Unbounded Admin user list when `page` is omitted (`users.ts:68-70`).
2. Sequential per-ID bulk mutations up to 100 IDs (`datMuaLinhKien.ts:2564`, `traHang.ts:381`).
3. Row-loop import existence checks and remote image fetches (`settingsDatMua.ts:183-198,300-321`).
4. Correlated latest-log subqueries in operational/report lists (`datMuaLinhKien.ts`, `phieuXuatKho.ts`).
5. Public-sheet fetch explicitly uses `cache: "no-store"` (`frontend/src/lib/publicSheetCache.ts:124`).

## Positive controls

- Common indexes exist for order status/recipient, PXK status/recipient, log foreign keys, users, and login time.
- Frontend search debounce is present in major operational tabs.
- Cloudflare service bindings avoid cross-worker network fetch restrictions for documented integrations.
- Hourly sync is the only declared cron trigger.

## Metrics required

Measure p50/p95/p99 route latency, D1 rows read and duration, Worker CPU time, request/response bytes, cache hit rate, external service latency/error rate, and bundle size. Exact waste percentages are not inferable from source.
