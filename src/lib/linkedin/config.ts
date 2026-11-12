import "server-only";

import { env } from "@server/config/env";

export function isLinkedInOAuthConfigured(): boolean {
  return env.linkedinOAuthConfigured;
}
