# Reachly — Product Requirements (Draft)

## Vision

Reachly helps teams run **structured LinkedIn outreach**: lead lists, campaign sequences, unified replies (Unibox), per-account limits, and analytics — with safety controls and workspace collaboration.

## Intended users

- Founders and sales leaders at SMBs
- Agencies managing outreach for multiple clients (future: multi-workspace)

## Core feature areas (product intent)

| Area | Intent |
|------|--------|
| Dashboard | Workspace health, funnel, active campaigns |
| Campaigns | Create sequences, attach lead lists, monitor progress |
| Lead lists | CSV import, status per lead |
| LinkedIn accounts | Connect accounts with conservative daily limits |
| Unibox | Unified inbox across accounts/campaigns |
| Analytics | Acceptance/reply rates, timing insights |
| Settings | Profile, workspace, team, billing, integrations, blacklist, safety |

## Confirmed for Task 001

- Reference-driven UI in Next.js
- Demo data and preview empty states
- No real auth or persistence

## Assumptions (to validate later)

- Workspace-scoped multi-tenancy
- Official or user-authorized LinkedIn connection flows (not password vaulting)
- Usage-based or seat-based billing on Starter/Growth tiers shown in reference UI

## Non-goals (current milestone)

- Production authentication
- Database and background workers
- Live message send/receive
- Payment processing
