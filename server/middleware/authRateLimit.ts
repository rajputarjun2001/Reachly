import rateLimit from "express-rate-limit";

/** Limits brute-force attempts against `/api/auth/*` (API clients). */
export const authApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});