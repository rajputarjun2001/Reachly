import type { LoginVerification, PlaywrightSession } from "./linkedinActions";
import * as linkedinActions from "./linkedinActions";

/** LinkedIn's emailed codes are short-lived; an idle browser also costs memory. */
export const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export type LoginChallenge = LoginVerification & {
  accountId: string;
  session: PlaywrightSession;
  expiresAt: number;
  /** True while a code is being submitted, so a double click cannot type into the page twice. */
  busy: boolean;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Sign-ins waiting for the account owner to verify, keyed by account id. The live browser cannot be
 * serialised, so this is in-memory: the verify request must reach the process that started the sign-in
 * (true for the single-process deployment; a multi-instance deployment needs sticky routing).
 */
const challenges = new Map<string, LoginChallenge>();

export async function holdLoginChallenge(
  accountId: unknown,
  session: PlaywrightSession,
  verification: LoginVerification,
): Promise<LoginChallenge> {
  const key = String(accountId);
  await dropLoginChallenge(key);
  const timer = setTimeout(() => void dropLoginChallenge(key), LOGIN_CHALLENGE_TTL_MS);
  timer.unref?.();
  const challenge: LoginChallenge = {
    ...verification,
    accountId: key,
    session,
    expiresAt: Date.now() + LOGIN_CHALLENGE_TTL_MS,
    busy: false,
    timer,
  };
  challenges.set(key, challenge);
  return challenge;
}

export function getLoginChallenge(accountId: unknown): LoginChallenge | undefined {
  const challenge = challenges.get(String(accountId));
  return challenge && challenge.expiresAt > Date.now() ? challenge : undefined;
}

/** Forgets the pending sign-in and closes its browser. */
export async function dropLoginChallenge(accountId: unknown) {
  const key = String(accountId);
  const challenge = challenges.get(key);
  if (!challenge) return;
  challenges.delete(key);
  clearTimeout(challenge.timer);
  await linkedinActions.closeLoginSession(challenge.session);
}

/** @internal test helper */
export async function _clearLoginChallenges() {
  await Promise.all([...challenges.keys()].map((key) => dropLoginChallenge(key)));
}
