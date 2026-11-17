# Reachly — Security

## Framework versions (required for production)

Reachly uses the **App Router** and Server Actions. Unpatched Next.js 15.x on a public host is a critical remote-code-execution risk (React2Shell / CVE-2025-66478) and follow-on RSC advisories.

- Pin **`next` to `15.2.8` or newer** on the 15.2 line (see [Next.js security advisories](https://nextjs.org/blog/security-update-2025-12-11)).
- After any compromise, **rotate** `JWT_SECRET` and `ENCRYPTION_KEY`, rebuild on a clean host, and force LinkedIn reconnects.
- On deploy, verify: `node -p "require('next/package.json').version"`.

Do not run `npm audit fix --force` on production lockfiles without review; it can jump major Next versions.

## Authentication

- Session is an httpOnly, `SameSite=lax` cookie (`reachly_session`) signed with `jose` (HS256).
- The cookie is not readable from JavaScript. Tokens are not stored in `localStorage`.
- Middleware verifies the signature only. Pages load the user from MongoDB and reject inactive or missing users.
- Sign-in errors stay generic so email addresses are not enumerated.
- `getSafeRedirectPath()` blocks open redirects.

## Secrets

- `JWT_SECRET` (min 32 chars) and `ENCRYPTION_KEY` (64 hex chars) live in `.env`, which is gitignored.
- `ENCRYPTION_KEY` encrypts LinkedIn passwords and session cookies (AES-256-GCM).
- There is no service-role key and no Supabase anon key in the client bundle.

## Tenant isolation

- Every mutable collection has `workspaceId`.
- Server Actions resolve workspace from the session (`requireAuthContext()`). Client-supplied workspace ids are ignored.
- REST handlers use `req.user.workspaceId` from the JWT.

This is application-level isolation, not database RLS. Do not expose MongoDB to the browser.

## LinkedIn credentials

- The connect-account form sends email + password to a Server Action.
- The password is encrypted before save (`LinkedInAccount` pre-save hook).
- Select queries hide `linkedinPasswordEncrypted` and `sessionCookies`.
- A LinkedIn challenge or restriction flags the account and pauses its campaigns.

Automating LinkedIn can violate LinkedIn's terms and can get the connected account restricted. Treat live send as an operator risk, not a guaranteed product.

## Uploads

- CSV import is limited in size (see `src/lib/leads/constants.ts` and the Multer 10MB cap on `/api/leads`).
- Blacklist (domain + profile URL) is applied before insert.
- Duplicate `linkedin_url` values in the same list are skipped.

## Rate limiting

- `/api/auth/*` is limited with `express-rate-limit` (30 requests / 15 min per IP; respects `trust proxy` in production).
- Login, sign-up, and accept-invite **Server Actions** share an in-memory per-IP limiter in `server/utils/authRateLimit.ts`. Multi-instance deploys should add Redis-backed limits or edge rate rules.

## Remaining risks
- Settings UI is not yet wired to the live members/blacklist APIs (the APIs exist).
- Playwright selectors will drift as LinkedIn changes their DOM.
