import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseConfigError, isSupabaseConfigured } from "./env";

const urlKey = "NEXT_PUBLIC_SUPABASE_URL";
const anonKey = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

describe("env", () => {
  afterEach(() => {
    delete process.env[urlKey];
    delete process.env[anonKey];
  });

  it("reports unconfigured when vars missing", () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseConfigError()).toMatch(/not configured/i);
  });

  it("accepts https url and anon key", () => {
    process.env[urlKey] = "https://example.supabase.co";
    process.env[anonKey] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test";
    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseConfigError()).toBeNull();
  });
});
