import "server-only";

import { env } from "@server/config/env";

export function isLinkedInOAuthConfigured(): boolean {
  return env.linkedinOAuthConfigured;
}

/** How "Sign in with browser" is offered on this server: a local window, a streamed page, or not at all. */
export function browserConnectMode(): "window" | "remote" | "off" {
  return env.browserConnectMode;
}
