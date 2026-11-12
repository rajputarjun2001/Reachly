# LinkedIn partner program — Communications track (Track B)

**Status:** Not submitted — use this checklist when pursuing official send/inbox APIs.  
**Related decision:** [LINKEDIN_INTEGRATION_DECISION.md](./LINKEDIN_INTEGRATION_DECISION.md) (Track A remains the engineering default).

## Goal

Obtain approval for partner **Communications** APIs (Invitations, Messages) so Reachly can send connection requests and member messages with **explicit member confirmation**, not unattended BullMQ automation.

## Prerequisites

- [ ] LinkedIn Developer app with verified Company Page ([associate app](https://www.linkedin.com/help/linkedin/answer/a548360))
- [ ] Legal review of [API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use) and BD DPA
- [ ] Product one-pager: human-in-the-loop sends, no bulk scraping, workspace isolation

## Application inputs (draft)

**Use case (plain language):** B2B teams run structured outreach from their own LinkedIn seats. Reachly stores campaign configuration and presents each outbound action for member confirmation before calling LinkedIn APIs (no silent scheduled DMs).

**Requested products (if available on portal):** Communications APIs — Invitations, Messages (read/send per approved scope).

**Data handling:** Encrypt tokens at rest; minimal profile cache; delete on disconnect; no resale of LinkedIn data.

**Anti-automation:** Background workers queue *drafts* only; API send occurs after in-app confirm (align with [Messages API requirements](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages)).

## Apply

- [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Partner apply](https://developer.linkedin.com/content/developer/global/en_us/index/partner-programs/apply)
- [Partner support guide](https://learn.microsoft.com/en-us/linkedin/shared/linkedin-api-partner-support-guide)

## If approved — engineering follow-up

1. Replace Playwright send paths in `connectionProcessor` / Unibox reply with API clients scoped to approved products.
2. Remove or gate unattended auto-send; audit log without message bodies in logs.
3. Re-evaluate Unibox inbound sync only if LinkedIn grants a **read** path (Compliance/inbox remains closed for most SaaS — see feasibility doc).

## If denied

- Stay on Track A (OIDC + session cookies + Playwright best-effort).
- Document rejection and narrow product to configuration + manual Unibox notes.
