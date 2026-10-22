type DemoEnvironmentBannerProps = {
  supabaseConfigured: boolean;
};

/** Shown only when the app runs without Supabase (local demo). Hidden after sign-in / configured env. */
export function DemoEnvironmentBanner({ supabaseConfigured }: DemoEnvironmentBannerProps) {
  if (supabaseConfigured) {
    return null;
  }

  return (
    <div
      role="status"
      style={{
        background: "var(--amber-light)",
        borderBottom: "1px solid #FCD34D",
        padding: "10px 20px",
        fontSize: 13,
        color: "#92400E",
        textAlign: "center",
      }}
    >
      <strong>Demo mode.</strong> Supabase is not configured — screens use sample data only.{" "}
      <a href="/setup" style={{ color: "var(--primary)", fontWeight: 600 }}>Setup guide</a>
    </div>
  );
}
