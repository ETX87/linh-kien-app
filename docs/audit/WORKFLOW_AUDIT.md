# Workflow Audit

The implemented workflow is represented by order header/line logs, PXK logs, shortage (`thieu_lk`) records, return logs, notifications, and report counters. The code documents separate branches for KTV/ve tinh, tram, TN, kho, ke toan, TP DVBH, and GS.

Static controls observed:

- Session and user approval/disabled checks occur before route handlers.
- Module access and read-only `la_view` behavior are centralized in middleware.
- Bulk IDs are capped at 100.
- PXK business key `ma_xuat_kho` is unique in the schema.
- Order/PXK tables have `version` fields.

Open production correctness risks:

- Concurrent approval, stock issue, status update, and retry behavior require a two-request replay test (`AUD-006`).
- Partial failure semantics for sequential bulk operations require explicit per-ID result verification (`AUD-002`).
- End-to-end KTV -> GS/TN -> kho -> accounting -> completion state counts need production comparison with API responses.

No production workflow was executed during this audit.
