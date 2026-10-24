import { SignJWT, jwtVerify } from "jose";

/** Must stay edge-compatible: imported by Next.js middleware. Only depends on `jose`. */

export const SESSION_COOKIE = "reachly_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionClaims = {
  userId: string;
  workspaceId: string | null;
  role: "owner" | "member";
};

function secretKey(secret = process.env.JWT_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set (min 32 characters)");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, expiresIn = process.env.JWT_EXPIRES_IN || "30d") {
  return new SignJWT({ wid: claims.workspaceId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifySession(token: string | null | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      workspaceId: typeof payload.wid === "string" ? payload.wid : null,
      role: payload.role === "owner" ? "owner" : "member",
    };
  } catch {
    return null;
  }
}
