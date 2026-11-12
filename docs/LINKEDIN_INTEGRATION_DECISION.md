# LinkedIn integration track decision

**Date:** 2026-11-12  
**Decision:** **Track A** — OIDC account identity + encrypted browser session for Playwright execution.

## Context

Reachly needs (1) reliable ways to bind a LinkedIn member to a workspace account and (2) a session that can drive connection requests, messages, and Unibox sync. Server-side password login and automated login forms are unreliable on cloud hosts and conflict with LinkedIn’s anti-automation controls.

## Options considered

| Track | Summary | Outcome |
|-------|---------|---------|
| **A** | Sign In with LinkedIn (OIDC) for identity; paste cookies / local browser for `li_at` session; keep Playwright workers for outreach | **Selected** |
| **B** | Pursue LinkedIn Communications partner APIs only; reduce or remove unattended automation | Parallel business track (see [LINKEDIN_PARTNER_APPLICATION.md](./LINKEDIN_PARTNER_APPLICATION.md)) |

## Track A — what we ship

1. **OIDC connect** — `openid profile email`, server-only token storage (encrypted), workspace-scoped `linkedinSub`.
2. **Execution session** — separate step: paste session cookies or browser capture on local dev; encrypted `sessionCookies` unchanged.
3. **Product honesty** — accounts can be “identity verified” without an active outreach session; campaigns require `active` status (valid session).
4. **UX** — cloud hosts default to cookies/OAuth; password login de-emphasized.

## What Track A does not claim

- OIDC does not replace `li_at` or grant Invitations/Messages APIs.
- Playwright outreach remains best-effort and policy-sensitive until partner APIs approve a different execution model.

## References

- [LINKEDIN_INTEGRATION_FEASIBILITY.md](./LINKEDIN_INTEGRATION_FEASIBILITY.md)
- [PRODUCTION.md](./PRODUCTION.md)
