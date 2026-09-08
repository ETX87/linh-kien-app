# API Map

All routes are mounted in `backend/src/index.ts` and protected by route-specific middleware. Main groups:

| Prefix | Purpose | Auth/role surface | Main risk |
|---|---|---|---|
| `/api/auth` | Google/session/view-as | session creation; Admin view-as | runtime session/config validation needed |
| `/api/users` | users/login log | Admin only | unbounded legacy list (`AUD-001`) |
| `/api/dat-mua-lk` | orders, workflow, reports, bulk actions | session + module + role/scope | sequential bulk mutations; latest-log subqueries |
| `/api/phieu-xuat-kho` | warehouse issue slips and money/status flow | session + module + role/scope | concurrency/runtime inventory proof needed |
| `/api/tra-hang` | returns and return images | session + module + role/scope | sequential bulk mutations |
| `/api/lk-settings` | parts/catalog settings | route-specific role checks | import/read volume |
| `/api/settings/*` | configuration, users, areas, partner keys | Admin or management middleware | configuration writes need audit trail review |
| `/api/notifications` | badges/tasks | session + derived scope | repeated aggregate queries possible |
| `/api/bao-cao-toc-do` | SLA/report metrics | session + scope | correlated status/report query cost |
| `/api/dvbh-sync` | sync state/manual sync | service/API key | external dependency and retry evidence needed |
| `/api/partner` | partner integration | API key auth | key rotation/rate-limit runtime evidence needed |
| `/api/push` | Web Push subscription/send | session | endpoint cleanup and dependency failures |

Static audit found parameterized SQL for user-supplied values in reviewed routes. Dynamic SQL is used for allow-listed table/order fragments and generated placeholders; this should remain allow-listed.
