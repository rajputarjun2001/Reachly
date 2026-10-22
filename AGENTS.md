# AGENTS.md — Reachly coding conventions

## Goals

1. **Design fidelity** — `design-reference/Reachly.html` is the visual source of truth. Prefer exact CSS variables and class patterns from `src/styles/reachly-reference.css` before inventing new spacing or colors.
2. **Strict TypeScript** — no `any` without justification; run `npm run typecheck` before finishing.
3. **Scoped changes** — one feature or fix per task; do not replace the reference design with generic SaaS templates.
4. **Security** — never add LinkedIn password collection, evasion claims, or secrets in the repo. See `docs/SECURITY.md`.
5. **Honest product boundaries** — do not describe planned backend features as shipped.

## Structure

- `src/app/` — routes and layouts only
- `src/components/screens/` — page-level UI composed from reference patterns
- `src/components/ui/` — small reusable primitives (dropdown, etc.)
- `src/data/demo/` — demonstration data only; label as demo in user-visible copy where needed
- `docs/` — product and architecture documentation

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
