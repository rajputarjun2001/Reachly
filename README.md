# Reachly

Reachly is a LinkedIn outreach workspace UI (demo/prototype). This repository implements the product shell and screens from the authoritative HTML reference in `design-reference/Reachly.html`.

## Stack

- **Next.js 15** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS** + extracted reference stylesheet (`src/styles/reachly-reference.css`)
- **Chart.js** / react-chartjs-2 (charts from the reference)
- **Lucide React** (sidebar icons aligned with reference strokes)
- **Vitest** + React Testing Library

## Prerequisites

- Node.js 20+
- npm

## Installation

```bash
cd Reachly
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (redirects to `/dashboard`).

Compare with the reference: open `design-reference/Reachly.html` in a browser at the same viewport width (~1280px desktop).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint (Next.js) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |

## Implementation status (Task 001)

**Implemented (UI demo):**

- App shell: sidebar, header/content layout, design tokens from reference CSS
- Routes: dashboard, campaigns, campaign detail, lead lists, LinkedIn accounts, Unibox, analytics, settings (7 panels), onboarding
- Modals: new campaign, connect account (no passwords), upload leads, lead list detail
- Preview toggle: populated vs empty states (sidebar control)
- Charts on dashboard, campaign detail, analytics
- Demo data under `src/data/demo/`

**Not implemented (by design for this milestone):**

- Authentication, database, billing, real LinkedIn integration, message sending, CSV import persistence

See `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md`.

## Documentation

- `docs/DESIGN_REFERENCE_AUDIT.md` — reference inventory and route map
- `docs/PRD.md` — product vision
- `docs/ARCHITECTURE.md` — code structure
- `docs/SECURITY.md` — security principles
- `AGENTS.md` — conventions for AI/human contributors
