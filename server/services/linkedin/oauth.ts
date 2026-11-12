import { env } from "../../config/env";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_OIDC_SCOPES = "openid profile email";

export type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

export type LinkedInUserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
};

export function isLinkedInOAuthConfigured(): boolean {
  return env.linkedinOAuthConfigured;
}

export function buildLinkedInAuthorizeUrl(state: string): string {
  if (!env.linkedinClientId) throw new Error("LINKEDIN_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.linkedinClientId,
    redirect_uri: env.linkedinOAuthRedirectUri,
    state,
    scope: LINKEDIN_OIDC_SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeLinkedInCode(code: string): Promise<LinkedInTokenResponse> {
  if (!env.linkedinClientId || !env.linkedinClientSecret) {
    throw new Error("LinkedIn OAuth is not configured");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.linkedinOAuthRedirectUri,
    client_id: env.linkedinClientId,
    client_secret: env.linkedinClientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as LinkedInTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || res.statusText;
    throw new Error(`LinkedIn token exchange failed: ${detail}`);
  }
  return json;
}

export async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as LinkedInUserInfo & { error?: string };
  if (!res.ok || !json.sub) {
    throw new Error(`LinkedIn userinfo failed: ${json.error || res.statusText}`);
  }
  return json;
}
