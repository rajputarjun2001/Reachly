# Design Reference Audit — `design-reference/Reachly.html`

Authoritative source: **`design-reference/Reachly.html`** (copied from workspace `Reachly.html`).  
Font: **Plus Jakarta Sans** (400–800). Chart library in reference: **Chart.js 4.4.1**.

## Design tokens (`:root`)

| Token | Light value | Usage |
|--------|-------------|--------|
| `--bg` | `#F5F6FA` | Page background |
| `--sidebar-bg` / `--card` | `#FFFFFF` | Sidebar, header, cards |
| `--border` | `#E5E7EB` | Borders, table rules |
| `--fg` / `--fg2` / `--fg3` | `#111827` / `#6B7280` / `#9CA3AF` | Text hierarchy |
| `--primary` | `#6366F1` | Brand, active nav, CTAs |
| `--primary-light` | `#EEF2FF` | Hover/active backgrounds |
| `--primary-dark` | `#4F46E5` | Primary button hover |
| Semantic | green `#10B981`, amber `#F59E0B`, red `#EF4444`, blue `#3B82F6` | Badges, deltas, charts |
| Layout | `--sidebar-w: 224px`, `--header-h: 60px`, `--radius: 10px` | Shell dimensions |
| Shadows | `--shadow`, `--shadow-md` | Cards, dropdowns |

Dark mode: `prefers-color-scheme` and `data-theme="dark"` overrides (reference includes both).

## Global layout

- **Body**: flex row; sidebar fixed left; **main** `margin-left: 224px`, min-height 100vh.
- **Sidebar**: logo block (32px indigo mark “R”, wordmark Reach**ly**), grouped nav (“Main”, “Account”), footer workspace pill + **Preview: Populated/Empty** toggle.
- **Header**: sticky 60px, title 16px/700 + subtitle 12px muted; actions right-aligned.
- **Content**: padding 24px.

## Screen inventory (`data-screen` + empty overlays)

| Reference key | Populated UI | Empty overlay (`es-*`) | App route |
|---------------|--------------|------------------------|-----------|
| `dashboard` | Stats, safety banner, activity chart, funnel, campaigns table | Get-started hero + 3 steps + tips | `/dashboard` |
| `campaigns` | Tabs + search + 2-col campaign cards + dashed “create” card | Centered empty state | `/campaigns` |
| `campaignDetail` | Back header, stats, line chart, sequence steps, leads table | (none in reference) | `/campaigns/[id]` |
| `leads` | 3-col list cards + upload card | CSV upload guide card | `/leads` |
| `accounts` | Safety banner + account card + add card | Connect CTA card | `/accounts` |
| `unibox` | 320px convo list + chat panel | Centered empty | `/unibox` |
| `analytics` | Stats + 2 charts + comparison table | Centered empty | `/analytics` |
| `settings` | 200px settings nav + 7 panels | (none) | `/settings` |
| Onboarding (`#onboardOverlay`) | 4-step wizard | N/A | `/onboarding` |

## Settings panels (in-page, not separate routes)

1. Profile — avatar, name, email, timezone  
2. Workspace — name, industry, daily limit, sending window, weekend toggle  
3. Members — table + invite  
4. Billing — plan card, payment, upgrade  
5. Integrations — HubSpot, Calendly, Slack, Webhooks  
6. Blacklist — domain/profile rows  
7. Safety — toggles + safety score banner  

## Modals

| ID (reference) | Purpose | App implementation |
|----------------|---------|-------------------|
| `newCampaignModal` | 4-tab wizard (Basics shown) | `newCampaign` modal |
| `addAccountModal` | LinkedIn credentials (reference) | **No password fields** — demo connect flow |
| `uploadLeadsModal` | CSV upload | `uploadLeads` modal |
| `leadDetailModal` | Lead table for a list | `leadDetail` modal |

## Reusable UI patterns

- **Buttons**: `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-sm`
- **Cards**: `.card`, `.card-header`, `.card-body`, `.stat-card`, `.campaign-card`, `.account-card`
- **Tables**: uppercase 11px headers on `--bg`, row hover `--primary-light`
- **Badges**: green/amber/red/blue/indigo/gray pill variants
- **Tabs**: underline active state + circular `.tab-count`
- **Dropdowns**: `.dropdown-menu` with `.dd-item` / `.dd-sep` / `.danger`
- **Forms**: `.form-group`, `.form-input`, `.form-select`, `.upload-zone`
- **Unibox**: `.unibox-wrap`, `.convo-item`, `.msg-bubble` sent/recv
- **Sequence**: `.sequence-step` with vertical connector line
- **Onboarding**: `.onboard-overlay`, progress dots, `.onboard-card`

## Charts (Chart.js config from reference JS)

| Canvas id | Type | Screen |
|-----------|------|--------|
| `activityChart` | Grouped bar (Sent + Accepted), legend bottom | Dashboard |
| `detailChart` | Line, filled, 14-day labels | Campaign detail |
| `daysChart` | Bar, indigo palette | Analytics |
| `stepsChart` | Horizontal bar | Analytics |

## Interactions (reference JavaScript)

- `navigate(screen)` — toggles `[data-screen].active`, syncs sidebar `.nav-item.active`, scroll top, lazy-inits analytics/detail charts
- `toggleEmptyMode()` — swaps populated vs `.empty-screen` per `emptyScreenMap`
- `openModal` / `closeModal` — `.modal-overlay.open`
- `toggleDD` — single open dropdown, click-outside close
- `switchSettings(panelId)` — show one `.settings-panel`
- Onboarding `nextStep` / `prevStep` — 4 steps, dot progress

## Responsive behavior in reference

- Reference CSS has **no mobile breakpoints**; only dark-mode media query.
- App adds breakpoints at 1200px / 900px / 640px for stats grids, sidebar drawer, unibox stack (documented extension).

## Product copy adjustments (security)

The reference includes LinkedIn password fields and claims about invisibility to LinkedIn. The React app **preserves layout** but replaces password collection with authorized-connection messaging and softens enforcement/evasion copy per `docs/SECURITY.md`.

## Screen-to-route mapping (implemented)

```
/ → redirect /dashboard
/dashboard
/campaigns
/campaigns/saas-founders-india | aec-decision-makers | interior-design-studios
/leads
/accounts
/unibox
/analytics
/settings
/onboarding
```
