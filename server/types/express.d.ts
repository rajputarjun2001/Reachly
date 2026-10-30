import type { SessionClaims } from "../auth/token";

declare global {
  namespace Express {
    interface Request {
      session?: SessionClaims;
    }
  }
}

export {};
