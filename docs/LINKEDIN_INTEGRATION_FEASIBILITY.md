# LinkedIn Integration Feasibility — Reachly (Task 009)

**Date:** 2026-10-22  
**Scope:** Research and planning only. No OAuth routes, migrations, or UI changes in this task.  
**Approval status:** Nothing in this document assumes Reachly’s LinkedIn Developer Portal app has been approved for partner APIs unless you confirm it in the portal.

---

## 1. Executive summary

Reachly’s product intent (PRD) is **structured LinkedIn outreach**: CSV lead lists, campaign configuration, multi-account limits, and a unified **Unibox**. The codebase already implements workspace persistence for leads, campaigns, and Unibox (without external sync). LinkedIn **Accounts** and **Connect** UI are demo-only (`accounts/page.tsx` uses `PreviewSwitch`; `app-modals.tsx` disables connect).

Official LinkedIn APIs **do not** offer a self-service path to:

- Import another member’s network at scale,
- Automate connection requests or DMs,
- Read a member’s messaging inbox for a product like Unibox.

Those capabilities are documented as **approved-partner** (Communications APIs) or **closed / private** (Compliance archiving) programs. The only **open** (self-service) member permissions today are **Sign In with LinkedIn using OpenID Connect** (`openid`, `profile`, `email`) and **Share on LinkedIn** (`w_member_social`) — neither delivers outreach or inbox sync.

**Practical recommendation:** Implement **Phase 1 — account identity binding** via OIDC (who connected which LinkedIn member to which workspace account). Continue **CSV-based leads** as user-supplied data. Treat **campaign execution, connection requests, DMs, and Unibox sync from LinkedIn** as **no-go until LinkedIn grants explicit partner access** and legal review confirms permitted use. Do **not** use scraping, browser automation, or password collection (aligned with `AGENTS.md`, `docs/SECURITY.md`, and product modals).

---

## 2. Current Reachly baseline (repository)

| Area | State | Implication for LinkedIn |
|------|--------|-------------------------|
| Auth | Supabase email/password + cookie sessions (`docs/ARCHITECTURE.md`) | LinkedIn OAuth should be a **separate** server-stored token flow, not mixed with anon key in the browser |
| Secrets | Only `NEXT_PUBLIC_SUPABASE_*` in client; no service role in app (`docs/SECURITY.md`, `.env.example`) | LinkedIn `client_secret` and refresh tokens must live server-only (env + encrypted DB) |
| Workspace | `requireWorkspaceContext()` / RLS (`src/lib/workspace/context.ts`) | `linkedin_accounts` (future) should be workspace-scoped with same trust model |
| Leads | CSV → `linkedin_url` validation, no LinkedIn API (`src/lib/leads/`) | **Feasible now** without LinkedIn API |
| Campaigns | Configuration only; no send workers | No API conflict until execution is built |
| Unibox | `conversations` / `messages` + internal notes; send disabled in live UI | Sync requires an **approved read path**; today there is none for general SaaS |
| Accounts UI | Demo preview only | OIDC connect can replace demo when implemented |
| Settings | Static demo panels | Integration settings should wait on real OAuth |

---

## 3. Capability matrix

Statuses used:

- **Available** — Self-service in Developer Portal for typical apps (no partner contract).
- **Approval required** — Documented API exists; LinkedIn must approve product/program.
- **Unavailable** — No official public API for Reachly’s use case, or program closed to new applicants.
- **Unverified** — Could not confirm current portal behavior or API availability from official docs alone.

| # | Capability | Reachly need | Official source | Permission / product | Approval | Status | Go / no-go |
|---|------------|--------------|-----------------|----------------------|----------|--------|------------|
| A | OAuth 2.0 / OIDC sign-in for a member | Bind “LinkedIn Account” to workspace user | [Sign In with LinkedIn (OIDC)](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) | `openid`, `profile`, `email` via product **Sign In with LinkedIn using OpenID Connect** | Self-service (Products tab) | **Available** | **Go** (identity only) |
| B | Authenticated member identity (name, photo, subject id) | Display connected account; dedupe accounts | [OIDC userinfo](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) (`GET https://api.linkedin.com/v2/userinfo`) | `profile` (+ `openid`) | Self-service | **Available** | **Go** |
| C | Authenticated member primary email | Optional account metadata | Same OIDC doc; email may be absent in response | `email` | Self-service | **Available** (field optional) | **Go** (handle missing email) |
| D | Full “basic profile” / headline for any URL | Enrich CSV leads from `linkedin_url` | [Profile API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api), [Profile by vanityName](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-vanity-name-api) | `r_liteprofile` / `r_basicprofile` (authenticated self); `r_compliance_2l` (vanity lookup, app token) | Partner / private | **Approval required** | **No-go** for bulk lead enrichment via API until approved; CSV remains user-provided |
| E | Lookup other members by public profile URL | Map `linkedin_url` → Person URN for messaging | VanityName API (above) | `r_compliance_2l` | Private, select developers | **Approval required** | **No-go** without contract |
| F | Import 1st-degree connections | “Upload my network” instead of CSV | [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api) | `r_1st_connections` | Approved developers only | **Approval required** | **No-go** until approved |
| G | Export address book / imported contacts | Contact import | [Contacts API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/contacts-api) | (Contacts API; compliance-related usage) | Approved developers only | **Approval required** | **No-go** until approved |
| H | Send connection invitation with note | Campaign `connection_request` steps | [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations) | Not listed in open permissions; partner Communications | Approved partners + API agreement | **Approval required** | **No-go** until partner |
| I | Send DM to 1st-degree connection | Campaign `message` steps | [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) | Partner Communications | Approved partners + API agreement | **Approval required** | **No-go** until partner; even then **no automation** per API rules |
| J | Reply in existing thread | Unibox outbound (future) | Messages API (`thread` URN) | Partner Communications | Approved partners | **Approval required** | **No-go** until partner; member must confirm send |
| K | List / read inbox conversations | Unibox inbound sync | [Compliance Snapshot](https://learn.microsoft.com/en-us/linkedin/compliance/compliance-snapshot-overview) (“We do not have Messages API to retrieve a snapshot of the member's inbox”); [Compliance Events](https://learn.microsoft.com/en-us/linkedin/compliance/compliance-snapshot-overview) for messaging archive | `r_compliance` / Compliance program | [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access): Compliance permissions **closed**, may not be requested | **Unavailable** (general SaaS inbox) | **No-go** for standard Unibox sync |
| K′ | Legacy mailbox read (v1) | — | [Reading from a Member's Mailbox](https://developer.linkedin.com/docs/v1/communications/reading-members-mailbox) (legacy developer network) | Historical v1 | — | **Unverified** (likely deprecated; not in current open programs) | **No-go** — do not plan on v1 |
| L | Scheduled / automated outreach | Campaign workers, queues | Messages API [Requirements](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) (no automated/scheduled send; explicit member action) | Partner + policy | Partner + UX compliance | **Unavailable** as automation | **No-go** for unattended automation even with Messages API |
| M | Post on member feed | Not core to Reachly | [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) — Share on LinkedIn | `w_member_social` | Self-service | **Available** | **No-go** for PRD (out of scope) |
| N | Lead Gen Forms / ad leads | Alternative lead source | [Marketing API permissions](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-06) e.g. `r_marketing_leadgen_automation` | Marketing Developer Program | MDP approval | **Approval required** | **Conditional go** only if product pivots to ads/Lead Gen |
| O | Sales Navigator CRM features | Display / validate SN profiles | [Getting Access — SNAP](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) | `r_sales_nav_*` | SNAP partner application | **Approval required** | **No-go** for core outreach unless SNAP approved |
| P | Programmatic refresh tokens | Long-lived account connection | [Programmatic Refresh Tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens) | MDP-approved partners (doc states MDP) | Partner | **Approval required** for programmatic refresh | **Unverified** for OIDC-only apps — assume **re-auth** every 60 days unless portal enables refresh |

**Important:** Obtaining an OAuth access token with OIDC scopes **does not** grant Invitations, Messages, Connections, or Compliance APIs. Scopes are enforced per [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) and the app’s **Products** tab.

---

## 4. OAuth architecture recommendation (Reachly)

### 4.1 Principles

1. **Keep Supabase auth for Reachly login**; treat LinkedIn as **linked account credentials** per workspace member (or per “sender account” row), not as replacement for workspace membership.
2. **3-legged OAuth only** for member-owned actions (connect account, future send-with-confirmation).
3. **Server-side token exchange** in Next.js Route Handlers or Server Actions; never expose `client_secret` or refresh tokens to the client.
4. **Store**: encrypted `access_token`, optional `refresh_token`, `expires_at`, LinkedIn `sub` / person id from OIDC, scopes granted, and workspace + linking user id.
5. **Separate redirect URI** e.g. `/auth/linkedin/callback` (not implemented in Task 009) with `state` CSRF binding to session.
6. **Minimal scopes** for Phase 1: `openid profile email` only.

### 4.2 Suggested flow (Phase 1)

```text
User (logged into Reachly via Supabase)
  → clicks Connect LinkedIn (future)
  → GET linkedin.com/oauth/v2/authorization?scope=openid%20profile%20email&state=...
  → callback with code
  → server exchanges code (client_id + client_secret)
  → server calls /v2/userinfo
  → upsert workspace linkedin_account row (member id, display name, token metadata)
  → revalidate /accounts
```

### 4.3 Token lifetime and refresh

| Token | Official behavior | Reachly handling |
|-------|-------------------|------------------|
| Access token | ~60 days (`expires_in` in [Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)) | Track expiry; call APIs only server-side; prompt reconnect before expiry |
| Refresh | [Programmatic refresh](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens) documented for **approved MDP partners**; otherwise re-run authorization (silent if session still valid) | Implement reconnect UX; add refresh only if portal grants it |
| Revocation | LinkedIn may revoke anytime; use [Token Introspection](https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection) when debugging | On 401, mark account `disconnected` and surface reconnect |

### 4.4 If partner APIs are ever approved

- Request **only** scopes shown on the app’s Auth tab after product approval.
- Messages / Invitations: implement **member-confirmed** send UI (draft → explicit send) per [Messages API requirements](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages).
- Do not build background schedulers that send without a per-action member confirmation.

---

## 5. Security and data retention

Aligned with Reachly `docs/SECURITY.md` and LinkedIn legal docs:

| Requirement | Source | Reachly action |
|-------------|--------|----------------|
| No storage of API content except as permitted | [API Terms of Use §4](https://www.linkedin.com/legal/l/api-terms-of-use) | Store OIDC ids + tokens; avoid caching other members’ profile fields from APIs |
| May store OAuth tokens | API Terms §4.2 | Encrypt at rest; never log token or message body |
| Delete on user request / account close | API Terms §4.4 | Disconnect LinkedIn → delete tokens and LinkedIn-sourced profile fields |
| Profile data refresh | API Terms §4.3 | Refresh authenticated member profile only while user is using connect/settings |
| Marketing data retention caps | [Marketing Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements?view=li-lms-2026-08) | If MDP approved later, apply field-level TTL (e.g. 24h cache for other members’ profile data) |
| DPA | API Terms §4.6 | Execute LinkedIn BD DPA if processing personal data from APIs |

**CSV leads:** URLs and names uploaded by the customer are **user-provided**, not LinkedIn API content — still treat as personal data under your privacy policy.

**Prohibited for Reachly (Task 009 constraints):** scraping, browser automation, cookie hijacking, LinkedIn password collection, evasion of rate limits.

---

## 6. LinkedIn Developer Portal setup (your action items)

1. **Create app** at [developer.linkedin.com](https://developer.linkedin.com/) ([Help: Accessing APIs](https://www.linkedin.com/help/linkedin/answer/a526048)).
2. **Associate a LinkedIn Company Page** as app publisher ([Associate app with Page](https://www.linkedin.com/help/linkedin/answer/a548360)); complete **Verify** flow with Page super admin ([verification request](https://www.linkedin.com/help/linkedin/answer/a1665329)) — required for many products; association is **permanent** per help docs.
3. **Products tab:** enable **Sign In with LinkedIn using OpenID Connect** (self-service).
4. **Auth tab:** configure redirect URLs for local/staging/production (exact match).
5. **Record** Client ID and Client Secret in server env only (new vars e.g. `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` — not in `.env.example` until implementation task).
6. **Do not assume** Communications, Connections, or Compliance products are enabled until the portal shows them approved.
7. **Partner applications** (if pursuing outreach/inbox): apply via program links on [Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) and [Partner apply](https://developer.linkedin.com/content/developer/global/en_us/index/partner-programs/apply) — Marketing MDP, SNAP, Talent, etc. There is **no** self-service toggle for Messages or Invitations APIs in open permissions.

---

## 7. Blocking approvals and unknowns

| Blocker | Impact on Reachly | Mitigation |
|---------|-------------------|------------|
| Communications APIs (Messages, Invitations) partner-only | No official send or connect automation | Partner application + legal review; or narrow product to manual workflow |
| No public inbox read API | Unibox cannot sync LinkedIn replies | Manual Unibox / internal notes (already built); Compliance program not open per Getting Access |
| Connections / Contacts APIs approval | No official network import | CSV leads (current) |
| Vanity / other-member Profile APIs private | No official URL → URN for arbitrary leads | User CSV only; or SNAP/MDP paths if approved |
| Compliance (`r_compliance`) closed to new requests | No regulatory archive path for inbox | Do not plan Unibox sync via Compliance Events |
| MDP programmatic refresh uncertain for non-MDP OIDC app | Tokens expire ~60 days | Reconnect UX |
| LinkedIn policy on outreach automation | Even with API, Messages API forbids unattended send | Human-in-the-loop send only |
| **Unverified:** Whether Reachly’s use case qualifies for any Communications partner tier | Gates entire execution layer | Direct LinkedIn partner/support inquiry with written use case |
| **Unverified:** Current status of legacy v1 mailbox docs | Must not be relied on | Ignore v1 |

---

## 8. Phased implementation plan (Reachly)

### Phase 0 — Governance (now)

- [x] Feasibility doc (this file).
- [ ] Legal/privacy review for LinkedIn API Terms + BD DPA.
- [ ] Decide business track: **identity-only SaaS** vs **partner application** for communications.

### Phase 1 — Account binding (implement next; no partner APIs)

- DB: `linkedin_accounts` (workspace-scoped, RLS), encrypted tokens, LinkedIn `sub`, display fields from userinfo.
- Server OAuth callback + disconnect + token expiry handling.
- Wire live **Accounts** page (replace `PreviewSwitch` demo when Supabase configured).
- Dashboard “Connect LinkedIn” → same flow.
- **No** message send, **no** connection requests, **no** inbox sync.

### Phase 2 — Partner pursuit (parallel, business)

- Submit partner program application with explicit flows (member-confirmed sends only).
- Document rejection/alternatives if denied.

### Phase 3 — Execution (only if Phase 2 succeeds)

- Map campaign steps to Invitations / Messages APIs with mandatory confirmation UI.
- Queue **human-triggered** actions only; rate limits per account; audit log without message body in logs.

### Phase 4 — Unibox sync (only if approved read/archive path exists)

- If LinkedIn grants Compliance Events or future inbox API: normalize to `conversations` / `messages`.
- Until then: Unibox remains workspace-local + manual entry.

### Phase 5 — Optional MDP / Lead Gen

- Lead Sync API for ad/form leads — only if product expands to marketing integrations.

---

## 9. Go / no-go summary by product feature

| Reachly feature | Go now? | Notes |
|-----------------|---------|-------|
| CSV lead lists with `linkedin_url` | **Go** | User-provided data; already implemented |
| Campaign drafts / configuration | **Go** | No LinkedIn API required |
| Unibox internal notes / manual threads | **Go** | Already implemented |
| “Connect LinkedIn” identity (who is sending) | **Go** | OIDC self-service |
| Multi-account limits (UI + DB enforcement) | **Go** | Policy layer; no API |
| Enrich leads via LinkedIn API | **No-go** | Partner/private APIs |
| Import connections from LinkedIn | **No-go** | `r_1st_connections` approval |
| Automated connection requests | **No-go** | Invitations API + policy |
| Automated / scheduled DMs | **No-go** | Messages API + explicit anti-automation rules |
| Member-confirmed single send (future) | **No-go until approved** | Possible only as partner with strict UX |
| Sync LinkedIn inbox to Unibox | **No-go** | No open read API; Compliance closed |
| Analytics on real reply rates from LinkedIn | **No-go** | Depends on inbox/sync or partner data |
| Share on LinkedIn from Reachly | **Go technically** | Out of PRD scope |

---

## 10. Official documentation index

| Topic | URL |
|-------|-----|
| Getting access / open vs partner permissions | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| OAuth 2.0 authorization code | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow |
| Sign In with LinkedIn (OIDC) | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 |
| Programmatic refresh tokens | https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens |
| Token introspection | https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection |
| Communications overview | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/overview |
| Messages API | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages |
| Invitations API | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations |
| Connections API | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api |
| Contacts API | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/contacts-api |
| Profile API | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api |
| Profile by vanityName | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-vanity-name-api |
| Compliance snapshot (inbox) | https://learn.microsoft.com/en-us/linkedin/compliance/compliance-snapshot-overview |
| Partner support / requesting access | https://learn.microsoft.com/en-us/linkedin/shared/linkedin-api-partner-support-guide |
| API Terms of Use | https://www.linkedin.com/legal/l/api-terms-of-use |
| Marketing data storage | https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements |
| Associate / verify Company Page | https://www.linkedin.com/help/linkedin/answer/a548360 , https://www.linkedin.com/help/linkedin/answer/a1665329 |
| Accessing APIs (help) | https://www.linkedin.com/help/linkedin/answer/a526048 |

---

## 11. Verification notes (Task 009)

- Repository inspected: architecture, env patterns, accounts/settings/leads/campaigns/unibox, security docs.
- Official sources cited above; legacy v1 mailbox and third-party “profile APIs” were **not** used as evidence of available capability.
- **No code changes** in this task; **tests not run** (not required).
- **`supabase db test` / LinkedIn portal:** not executed — portal approval state is **unknown** until you confirm in Developer Portal.

---

*End of Task 009 deliverable.*
