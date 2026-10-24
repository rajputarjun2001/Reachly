import { getBackendConfigError } from "@/lib/env";

export function BackendNotice() {
  const message = getBackendConfigError();
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
      <strong>Backend not configured.</strong> {message} Authentication is disabled until the environment
      variables in <code>.env</code> are set.
    </div>
  );
}
