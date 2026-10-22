/** Set when the user has a workspace; avoids a DB round-trip on every client navigation. */
export const WORKSPACE_READY_COOKIE = "reachly_workspace_ready";

export const workspaceReadyCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
