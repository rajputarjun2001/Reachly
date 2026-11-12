import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createWorkspaceFixture } from "./factory";
import { LinkedInAccount } from "../models";
import * as linkedinOAuth from "../domain/linkedinOAuth";
import { signLinkedInOAuthState } from "../services/linkedin/oauthState";
import { decrypt, isEncrypted } from "../utils/encryption";

useTestDb();

const originalFetch = global.fetch;

describe("LinkedIn OIDC connect", () => {
  beforeEach(() => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "test-client-id");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "test-client-secret");
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("builds an authorize URL with signed state", async () => {
    const fx = await createWorkspaceFixture();
    const { authorizeUrl } = await linkedinOAuth.beginLinkedInOAuthConnect(fx.ctx, {
      label: "Sales",
      dailyLimit: 8,
      fallbackEmail: "seller@example.com",
    });
    const url = new URL(authorizeUrl);
    expect(url.hostname).toBe("www.linkedin.com");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("creates a workspace account from OAuth callback and marks session required", async () => {
    const fx = await createWorkspaceFixture();
    const state = await signLinkedInOAuthState({
      workspaceId: String(fx.ctx.workspaceId),
      userId: String(fx.ctx.userId),
      label: "OIDC",
      dailyLimit: 10,
      fallbackEmail: "oidc@example.com",
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("accessToken")) {
        return new Response(JSON.stringify({ access_token: "at-123", expires_in: 3600, scope: "openid profile email" }), {
          status: 200,
        });
      }
      if (url.includes("userinfo")) {
        return new Response(
          JSON.stringify({ sub: "linkedin-sub-9", name: "OAuth User", email: "oidc@example.com" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const result = await linkedinOAuth.completeLinkedInOAuthConnect("auth-code", state);
    expect(result.needsSession).toBe(true);

    const account = await LinkedInAccount.findById(result.accountId).select("+oauthAccessTokenEncrypted");
    expect(account?.linkedinSub).toBe("linkedin-sub-9");
    expect(account?.status).toBe("disconnected");
    expect(account?.flagReason).toBe(linkedinOAuth.SESSION_REQUIRED);
    expect(isEncrypted(account?.oauthAccessTokenEncrypted)).toBe(true);
    expect(decrypt(account!.oauthAccessTokenEncrypted!)).toBe("at-123");
  });
});
