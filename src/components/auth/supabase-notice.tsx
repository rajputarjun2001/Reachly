import { getSupabaseConfigError } from "@/lib/env";

export function SupabaseNotice() {
  const message = getSupabaseConfigError();
  if (!message) return null;

  return (
    <div
      role="alert"
      style={{
        background: "var(--amber-light)",
        border: "1px solid #FCD34D",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 20,
        fontSize: 13,
        color: "#92400E",
      }}
    >
      <strong>Supabase not configured.</strong> {message} Authentication is disabled until
      environment variables are set.
    </div>
  );
}
