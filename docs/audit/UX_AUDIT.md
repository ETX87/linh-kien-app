# UX Audit

Static review confirms dedicated React modules for order creation, lists, PXK, shortages, returns, reports, settings, and mobile order creation. Shared components include loading, modal, drawer, table, tabs, toast, tooltip, and pagination primitives.

Workflow usability risks to validate with task tests:

- Pipeline counters and filtered list results must remain equal after area/KTV filters.
- Bulk actions need visible partial-success and conflict feedback, not only a single success/failure toast.
- Generic server errors (`INTERNAL_ERROR`) do not explain recovery steps (`AUD-007`).
- Mobile order creation and large tables require real-device verification; source inspection cannot establish touch target, overflow, or loading quality.

Recommended task study: KTV creates/submits an order, supervisor/TN processes it, warehouse issues it, accounting confirms it, and KTV acknowledges receipt. Record steps, elapsed time, mistaken actions, feedback, and failed requests in desktop and mobile sessions.
