import type { AuthError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { signUpErrorMessage } from "./errors";

describe("signUpErrorMessage", () => {
  it("maps duplicate user", () => {
    const msg = signUpErrorMessage({
      message: "User already registered",
      name: "AuthApiError",
      status: 400,
    } as AuthError);
    expect(msg).toMatch(/already exists/i);
  });
});
