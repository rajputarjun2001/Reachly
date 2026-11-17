const FIXED: Record<string, string> = {
  connect_unavailable: "LinkedIn did not show a Connect button on this profile.",
  connection_not_accepted: "Connection request was not accepted within 30 days.",
  invitation_withdrawn: "The pending invitation was withdrawn on LinkedIn.",
};

const SEND_FAILED: Record<string, string> = {
  SESSION_EXPIRED: "LinkedIn session expired — reconnect the account.",
  LOGIN_FORM_NOT_FOUND: "Login blocked from this server — paste session cookies on the LinkedIn account.",
  CHALLENGE_REQUIRED: "LinkedIn asked for verification — sign in manually and refresh cookies.",
  ACCOUNT_RESTRICTED: "LinkedIn restricted this account.",
  INVITATION_LIMIT: "LinkedIn invitation limit reached.",
  ALREADY_CONNECTED: "Already connected on LinkedIn.",
  ALREADY_PENDING: "A connection request is already pending.",
};

/** User-facing explanation for `Lead.skipReason` (skipped / some failures). */
export function formatSkipReason(reason: string | null | undefined): string | null {
  const raw = reason?.trim();
  if (!raw) return null;
  if (FIXED[raw]) return FIXED[raw];
  if (raw.startsWith("connect_unavailable:")) {
    return `LinkedIn did not show a way to connect with this person (${raw.slice("connect_unavailable:".length).trim()}).`;
  }
  if (raw.startsWith("send_failed:")) {
    const code = raw.slice("send_failed:".length);
    return SEND_FAILED[code] ?? `Connection send failed (${code.replace(/_/g, " ").toLowerCase()}).`;
  }
  if (raw.startsWith("message_failed:")) {
    const code = raw.slice("message_failed:".length);
    return `Follow-up send failed (${code.replace(/_/g, " ").toLowerCase()}).`;
  }
  return raw.replace(/_/g, " ");
}
