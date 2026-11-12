import { LinkedInAccount, type LinkedInAccountDoc } from "../models";
import { encrypt } from "../utils/encryption";
import { AppError, badRequest, conflict, notFound, unprocessable } from "../utils/errors";
import {
  buildLinkedInAuthorizeUrl,
  exchangeLinkedInCode,
  fetchLinkedInUserInfo,
  isLinkedInOAuthConfigured,
  LINKEDIN_OIDC_SCOPES,
} from "../services/linkedin/oauth";
import { signLinkedInOAuthState, verifyLinkedInOAuthState, type LinkedInOAuthConnectState } from "../services/linkedin/oauthState";
import { oid, type AuthContext } from "./context";
import { resolveAccountDailyLimit, SESSION_REQUIRED } from "./accounts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { SESSION_REQUIRED };

export { isLinkedInOAuthConfigured };

function displayNameFromUserinfo(info: Awaited<ReturnType<typeof fetchLinkedInUserInfo>>): string | undefined {
  if (info.name?.trim()) return info.name.trim();
  const parts = [info.given_name, info.family_name].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function resolveEmail(
  info: Awaited<ReturnType<typeof fetchLinkedInUserInfo>>,
  state: LinkedInOAuthConnectState,
): string {
  const fromOidc = info.email?.trim().toLowerCase();
  if (fromOidc && EMAIL_RE.test(fromOidc)) return fromOidc;
  const fallback = state.fallbackEmail?.trim().toLowerCase();
  if (fallback && EMAIL_RE.test(fallback)) return fallback;
  throw badRequest(
    "LinkedIn did not return an email for this account. Enter your LinkedIn email before connecting, or reconnect with a session that includes your email.",
  );
}

export async function beginLinkedInOAuthConnect(
  ctx: AuthContext,
  input: { label?: unknown; dailyLimit?: unknown; fallbackEmail?: unknown },
): Promise<{ authorizeUrl: string }> {
  if (!isLinkedInOAuthConfigured()) {
    throw unprocessable("LinkedIn Sign-In is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
  }
  const dailyLimit = await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit);
  const fallbackEmail =
    input.fallbackEmail !== undefined && String(input.fallbackEmail).trim()
      ? String(input.fallbackEmail).trim().toLowerCase()
      : undefined;
  if (fallbackEmail && !EMAIL_RE.test(fallbackEmail)) throw badRequest("Enter a valid LinkedIn email.");

  const state = await signLinkedInOAuthState({
    workspaceId: String(ctx.workspaceId),
    userId: String(ctx.userId),
    label: input.label ? String(input.label).trim() : undefined,
    dailyLimit,
    fallbackEmail,
  });

  return { authorizeUrl: buildLinkedInAuthorizeUrl(state) };
}

export async function completeLinkedInOAuthConnect(
  code: string,
  stateToken: string,
): Promise<{ accountId: string; needsSession: boolean }> {
  if (!isLinkedInOAuthConfigured()) {
    throw new AppError(503, "LinkedIn Sign-In is not configured.");
  }

  const state = await verifyLinkedInOAuthState(stateToken);
  if (!state) throw badRequest("LinkedIn sign-in expired or was invalid. Start again from Accounts.");

  let tokenResponse;
  let userinfo;
  try {
    tokenResponse = await exchangeLinkedInCode(code);
    userinfo = await fetchLinkedInUserInfo(tokenResponse.access_token);
  } catch (err) {
    console.error("[linkedin oauth] callback failed:", (err as Error).message);
    throw new AppError(502, "Could not complete LinkedIn sign-in. Try again.");
  }

  const email = resolveEmail(userinfo, state);
  const existingBySub = await LinkedInAccount.findOne({
    workspaceId: state.workspaceId,
    linkedinSub: userinfo.sub,
  });
  if (existingBySub) {
    throw conflict("This LinkedIn member is already connected in your workspace.");
  }
  const existingByEmail = await LinkedInAccount.findOne({
    workspaceId: state.workspaceId,
    linkedinEmail: email,
  });
  if (existingByEmail) {
    throw conflict("An account with this LinkedIn email already exists. Update its session instead.");
  }

  const expiresAt = new Date(Date.now() + (tokenResponse.expires_in || 60 * 24 * 60 * 60) * 1000);
  const account = await LinkedInAccount.create({
    workspaceId: state.workspaceId,
    linkedinEmail: email,
    linkedinSub: userinfo.sub,
    label: state.label,
    dailyLimit: state.dailyLimit ?? (await resolveAccountDailyLimit(state.workspaceId, undefined)),
    fullName: displayNameFromUserinfo(userinfo),
    profileUrl: userinfo.picture,
    oauthAccessTokenEncrypted: encrypt(tokenResponse.access_token),
    oauthExpiresAt: expiresAt,
    oauthScopes: tokenResponse.scope || LINKEDIN_OIDC_SCOPES,
    status: "disconnected",
    flagReason: SESSION_REQUIRED,
  });

  await logOAuthConnect(account);

  return { accountId: String(account._id), needsSession: true };
}

async function logOAuthConnect(account: LinkedInAccountDoc) {
  const { logEvent } = await import("../services/events");
  await logEvent({
    workspaceId: account.workspaceId,
    linkedinAccountId: account._id,
    eventType: "session_refreshed",
    payload: { source: "linkedin_oauth", linkedinSub: account.linkedinSub },
  });
}

export async function assertAccountOAuthOwner(ctx: AuthContext, accountId: string) {
  const account = await LinkedInAccount.findOne({
    _id: oid(accountId, "account id"),
    workspaceId: ctx.workspaceId,
  });
  if (!account) throw notFound("LinkedIn account not found");
  return account;
}
