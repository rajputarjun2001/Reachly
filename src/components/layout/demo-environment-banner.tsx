type DemoEnvironmentBannerProps = {
  supabaseConfigured: boolean;
  workspaceName?: string;
};

export function DemoEnvironmentBanner({
  supabaseConfigured,
  workspaceName,
}: DemoEnvironmentBannerProps) {
  if (!supabaseConfigured) {
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

  return (
    <div
      role="status"
      style={{
        background: "var(--primary-light)",
        borderBottom: "1px solid var(--border)",
        padding: "8px 20px",
        fontSize: 12.5,
        color: "var(--fg2)",
        textAlign: "center",
      }}
    >
      Signed in{workspaceName ? ` · ${workspaceName}` : ""}. Dashboard metrics and campaigns are still{" "}
      <strong>demo UI data</strong> until later milestones persist them to your workspace.
    </div>
  );
}
