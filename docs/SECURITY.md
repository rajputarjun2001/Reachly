# Reachly — Security

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

## Remaining risks

- No rate limiting on auth endpoints.
- Settings UI is not yet wired to the live members/blacklist APIs (the APIs exist).
- Playwright selectors will drift as LinkedIn changes their DOM.
