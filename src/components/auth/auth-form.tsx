"use client";

import { useActionState, type ReactNode } from "react";
import type { AuthActionState } from "@/app/(auth)/actions";

type AuthFormProps = {
  action: (prev: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  children: ReactNode;
  submitLabel: string;
  hiddenFields?: Record<string, string>;
};

export function AuthForm({ action, children, submitLabel, hiddenFields }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {state.error ? (
        <div
          role="alert"
          style={{
            background: "var(--red-light)",
            border: "1px solid #FECACA",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 13,
            color: "#B91C1C",
          }}
        >
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div
          role="status"
          style={{
            background: "var(--green-light)",
            border: "1px solid #A7F3D0",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 13,
            color: "#065F46",
          }}
        >
          {state.success}
        </div>
      ) : null}
      {children}
      <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
