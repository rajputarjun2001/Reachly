# Implementation Plan

## Phase 1 — Foundation and reference-driven UI

- [x] Audit `Reachly.html` → `docs/DESIGN_REFERENCE_AUDIT.md`
- [x] Next.js + TypeScript + Tailwind + reference CSS
- [x] Shell, routes, modals, charts, empty-state preview toggle
- [x] Security-aligned copy (no password collection)
- [ ] Pixel-level visual QA across all screens (ongoing refinement)

## Phase 2 — UI verification and refinement

- Side-by-side screenshots vs reference at 1280px and 375px
- Fix spacing, chart sizing, and settings/billing panel parity
- Expand component tests for critical navigation

## Phase 3 — Authentication and workspaces

- [x] Supabase Auth (email/password, reset, callback, sign-out)
- [x] Cookie sessions via `@supabase/ssr`
- [x] Protected routes in middleware when Supabase configured
- [x] Workspace setup flow + `create_initial_workspace` RPC
- [x] Server-side workspace context resolver
- [ ] Workspace switcher UI (resolver supports multiple memberships later)

## Phase 4 — Database schema, authorization, tenant isolation

- [x] Initial migrations + RLS for profiles/workspaces/members
- [x] Lead lists + leads with `workspace_id` and cross-list FK enforcement
- [x] Campaign + campaign_steps tables with `workspace_id`

## Phase 5 — Lead management and CSV processing

- [x] Upload pipeline, validation, deduplication, list CRUD (Leads page + Server Actions)
- [ ] Lead export download, richer in-app edit forms

## Phase 6 — Campaign configuration and lifecycle

- [x] Campaign list/detail wired to Supabase; wizard saves draft + sequence
- [x] Status pause/resume/archive (configuration only)
- [ ] Outreach execution, scheduling workers, LinkedIn account binding

## Phase 7 — Inbox and conversation workflows

- Unibox sync, compose/send with audit trail

## Phase 8 — Supported integrations and background processing

- LinkedIn connection strategy, webhooks, HubSpot/Calendly/Slack

## Phase 9 — Analytics, billing, audit logs, operations

- [x] Workspace-scoped dashboard & analytics (counts/trends; no outreach performance)
- [ ] Outreach performance metrics, Stripe, admin tooling

## Phase 10 — Security review, testing, deployment, production readiness

- Pen test, load test, CI/CD, observability
