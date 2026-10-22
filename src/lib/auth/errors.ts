import type { AuthError } from "@supabase/supabase-js";

/** User-safe sign-up errors; includes Supabase message in development for debugging. */
export function signUpErrorMessage(error: AuthError): string {
  const msg = error.message.toLowerCase();

  if (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    error.code === "user_already_exists"
  ) {
    return "An account with this email already exists. Try signing in or reset your password.";
  }

  if (msg.includes("signup") && msg.includes("disabled")) {
    return "Email sign-up is disabled in your Supabase project. Enable it under Authentication → Providers → Email.";
  }

  if (msg.includes("redirect") || msg.includes("redirect_to")) {
    return "Redirect URL not allowed. In Supabase → Authentication → URL configuration, add http://localhost:3000/auth/callback (and your NEXT_PUBLIC_SITE_URL if different).";
  }

  if (
    msg.includes("confirmation") ||
    msg.includes("sending") ||
    msg.includes("email rate") ||
    msg.includes("error sending")
  ) {
    return "Could not send a confirmation email. For local dev, turn off “Confirm email” under Authentication → Providers → Email, or configure SMTP under Project Settings → Authentication.";
  }

  if (msg.includes("password")) {
    return "Password does not meet requirements. Use at least 8 characters (check Supabase password rules if you changed them).";
  }

  if (msg.includes("invalid") && msg.includes("email")) {
    return "Enter a valid email address.";
  }

  if (msg.includes("invalid api key") || msg.includes("jwt")) {
    return "Supabase API key or URL is invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.";
  }

  if (process.env.NODE_ENV === "development") {
    return `Sign-up failed: ${error.message}`;
  }

  return "Unable to create account. Try a different email or password.";
}
