# Reachly — Architecture

## Overview

Single Next.js application. Server components are used for static page shells where possible; client components handle charts, modals, navigation preview mode, and Unibox selection.

## Routing

| Path | Component source |
|------|------------------|
| `/dashboard` | `dashboard-screen.tsx` + `PreviewSwitch` |
| `/campaigns` | `campaigns-screen.tsx` |
| `/campaigns/[id]` | `campaign-detail-screen.tsx` + `getCampaignById` |
| `/leads`, `/accounts`, `/unibox`, `/analytics` | respective `*-screen.tsx` + empty variants |
| `/settings` | `settings-screen.tsx` (client panel state) |
| `/onboarding` | `onboarding-screen.tsx` (outside app shell) |

Route group `(app)` wraps authenticated-style shell: `AppProviders` → `AppShell` → `Sidebar` + `AppModals`.

## Styling strategy

- **Reference CSS** extracted to `src/styles/reachly-reference.css` (tokens + component classes from HTML)
- **Tailwind** for incremental utilities; global import order: reference CSS, then Tailwind
- **Plus Jakarta Sans** via `next/font/google`

## State

| Concern | Mechanism |
|---------|-----------|
| Empty vs populated preview | `PreviewModeProvider` |
| Modals | `ModalProvider` + `AppModals` |
| Settings panel | Local `useState` in `SettingsScreen` |
| Unibox thread | Local `useState` for selected conversation |

## Demo data

`src/data/demo/*` — campaigns, conversations, workspace profile. Not loaded from an API.

## Planned evolution

1. API layer (REST or tRPC) behind server actions
2. Auth (session/JWT) + workspace membership
3. Postgres (or similar) with tenant_id on all domain tables
4. Job queue for campaign execution and inbox sync via **supported** LinkedIn APIs/workflows
5. Replace demo providers with real data fetching (RSC + caching)

## Implemented vs planned

| Capability | Status |
|------------|--------|
| Reference UI routes | Implemented |
| Charts | Implemented (client Chart.js) |
| CSV upload / send message | UI only, disabled or non-persistent |
| Auth, DB, billing, LinkedIn API | Planned |
