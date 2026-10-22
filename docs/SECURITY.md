# Reachly — Security Principles

## Intended principles (not all implemented yet)

### Tenant isolation

- Every workspace’s data must be scoped by `workspace_id` at the database and API layers.
- Cross-tenant access must be impossible via ID guessing (authorize on every request).

### Authorization

- Role-based access within a workspace (owner, member, future roles).
- Server-side enforcement; UI hiding alone is insufficient.

### Secrets

- LinkedIn and third-party credentials live in server-side secret stores only.
- **Never** collect LinkedIn passwords in the web UI (the HTML reference included prototype password fields; the app does not).

### Input validation

- Validate CSV uploads, message templates, and URLs server-side.
- Sanitize user-generated content displayed in Unibox.

### Logging and audit

- Audit log for campaign changes, sends, and integration connections (planned).

### Customer data

- Encrypt sensitive fields at rest; minimize retention of message content per policy.

## Prototype boundaries (current app)

- No authentication — do not deploy publicly without auth.
- Demo buttons (Send, Upload, Connect) are disabled or non-functional by design.
- Do not add API keys or `.env` values to the repository.

## LinkedIn and automation

- Use **authorized** integration paths compliant with LinkedIn terms.
- Do not implement detection evasion, proxy bypass, or “invisible automation” features.
