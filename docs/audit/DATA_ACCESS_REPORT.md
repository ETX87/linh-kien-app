# Data Access Report

## Confirmed observations

- D1/SQLite is used throughout; migrations include indexes for common order, user, status, and log foreign keys.
- Most operational lists implement `LIMIT/OFFSET`, but `users` and settings routes retain compatibility branches that return all rows when page is omitted.
- Bulk guards cap IDs at 100, but processing remains sequential per ID.
- Import routes perform existence checks and image fetches inside row loops.
- Latest-state reporting uses correlated `ORDER BY id DESC LIMIT 1` log lookups.

## Data waste assessment

Exact requested/needed/waste counts are `UNKNOWN - NEED MORE EVIDENCE`; no production metrics or representative D1 row counts were available.

| Access pattern | Requested | Needed | Waste | Evidence |
|---|---:|---:|---:|---|
| Admin users without `page` | all matching users | current UI page | unknown | `users.ts:68-70` |
| Bulk workflow action | up to 100 IDs plus per-ID queries | one validated state transition per ID | unknown | `datMuaLinhKien.ts:2560-2564` |
| Catalog import | row-by-row existence/image operations | batch validation/write | unknown | `settingsDatMua.ts:183-198,300-321` |

## Required measurements

Capture D1 query plans, rows read, query duration, API payload bytes, and route-level request counts before assigning percentage waste.
