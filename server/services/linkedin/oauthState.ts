import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "linkedin_oauth";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set (min 32 characters)");
  return new TextEncoder().encode(secret);
}

export type LinkedInOAuthConnectState = {
  workspaceId: string;
  userId: string;
  label?: string;
  dailyLimit?: number;
  /** Used when OIDC userinfo omits email. */
  fallbackEmail?: string;
};

export async function signLinkedInOAuthState(state: LinkedInOAuthConnectState): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    workspaceId: state.workspaceId,
    userId: state.userId,
    label: state.label,
    dailyLimit: state.dailyLimit,
    fallbackEmail: state.fallbackEmail,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey());
}

export async function verifyLinkedInOAuthState(token: string | null | undefined): Promise<LinkedInOAuthConnectState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.workspaceId !== "string" || typeof payload.userId !== "string") return null;
    return {
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      label: typeof payload.label === "string" ? payload.label : undefined,
      dailyLimit: typeof payload.dailyLimit === "number" ? payload.dailyLimit : undefined,
      fallbackEmail: typeof payload.fallbackEmail === "string" ? payload.fallbackEmail : undefined,
    };
  } catch {
    return null;
  }
}
