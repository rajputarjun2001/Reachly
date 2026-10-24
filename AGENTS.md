# AGENTS.md — Reachly coding conventions

## Goals

1. **Design fidelity** — `design-reference/Reachly.html` is the visual source of truth. Prefer exact CSS variables and class patterns from `src/styles/reachly-reference.css` before inventing new spacing or colors.
2. **Strict TypeScript** — no `any` without justification; run `npm run typecheck` before finishing.
3. **Scoped changes** — one feature or fix per task; do not replace the reference design with generic SaaS templates.
4. **Honest product boundaries** — do not describe planned features as shipped. LinkedIn selectors and live send behavior must be treated as best-effort until verified against a real account.
5. **Secrets stay out of git** — never commit `.env`, cookies, or LinkedIn credentials. Passwords are encrypted with AES-256-GCM using `ENCRYPTION_KEY`.

## Structure

This is a **single-repo monolith**. One process serves the Next.js UI, the Express REST API under `/api`, and (optionally) BullMQ workers.

- `src/app/` — Next.js routes and Server Actions
- `src/components/` — UI composed from the reference design
- `src/lib/` — Next.js adapters that call `server/domain/*` (no second database layer)
- `src/data/demo/` — preview-mode sample data only
- `server/` — Express API, Mongoose models, Playwright, queues, workers
- `docs/` — product and architecture documentation

Import backend code from Next.js as `@server/...`. Do not add a separate backend repository.

## Client components

Use `"use client"` only for interactivity: modals, dropdowns, charts, preview toggle, Unibox selection, settings panel switching.

## Validation (required before claiming done)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Accessibility

- Semantic headings and labels on form controls
- Keyboard-operable buttons and modals (Escape closes modals)
- Visible focus on interactive controls

## Commits

Follow repository git rules; do not commit `.env` or credentials.
