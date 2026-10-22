# Implementation Plan

## Phase 1 — Foundation and reference-driven UI (current)

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

- Sign up / login, session management, workspace switcher

## Phase 4 — Database schema, authorization, tenant isolation

- Migrations, RLS or app-layer tenant guards, roles

## Phase 5 — Lead management and CSV processing

- Upload pipeline, validation, deduplication, list CRUD

## Phase 6 — Campaign configuration and lifecycle

- Full wizard, sequence editor, scheduling, pause/resume

## Phase 7 — Inbox and conversation workflows

- Unibox sync, compose/send with audit trail

## Phase 8 — Supported integrations and background processing

- LinkedIn connection strategy, webhooks, HubSpot/Calendly/Slack

## Phase 9 — Analytics, billing, audit logs, operations

- Metrics aggregation, Stripe, admin tooling

## Phase 10 — Security review, testing, deployment, production readiness

- Pen test, load test, CI/CD, observability
