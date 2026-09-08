# Security Audit

## Controls observed

- Cookie JWT verification precedes route access.
- User is reloaded from D1 on each request; disabled/pending/rejected accounts are blocked.
- Admin-only user management is enforced server-side.
- Module read-only behavior for `la_view` is enforced server-side for non-GET requests.
- Role/scope middleware is used on order/PXK/return routes.
- SQL values are generally bound parameters; generated `IN` placeholders are used for lists.
- Integration secrets are documented as Wrangler secrets rather than ordinary vars.

## Risks / evidence gaps

- IDOR and cross-area authorization need black-box requests using IDs/emails from another area; static review alone cannot certify every handler.
- Session/JWT secret rotation, revocation, and replay behavior need operational evidence.
- Partner API key rate limiting, expiry, and audit trail need runtime/config verification.
- CORS/CSRF behavior was not evidenced in the reviewed Worker entrypoint; browser cookie deployment is `SameSite=Lax`, but cross-origin policy should be explicitly tested.
- Generic error boundary lacks correlation IDs (`AUD-007`).

Conclusion: no confirmed authorization bypass was established in this static pass; security certification remains `NEED MORE EVIDENCE` for endpoint-by-endpoint black-box tests.
