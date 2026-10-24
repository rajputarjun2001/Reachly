import type { SessionClaims } from "../auth/token";

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionClaims;
  }
}

export {};
