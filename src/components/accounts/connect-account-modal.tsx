"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modals/modal-shell";
import { connectAccountAction } from "@/app/(app)/accounts/actions";

type ConnectAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ConnectAccountModal({ open, onClose }: ConnectAccountModalProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setError(null);
      formRef.current?.reset();
    }
  }, [open]);

  const submit = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await connectAccountAction(formData);
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={pending ? () => undefined : onClose}
      title="Connect LinkedIn Account"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Signing in to LinkedIn…" : "Connect"}
          </button>
        </>
      }
    >
      <div
        style={{
          background: "var(--blue-light)",
          border: "1px solid #BFDBFE",
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 20,
          fontSize: 12.5,
          color: "#1E40AF",
        }}
      >
        Reachly signs in to LinkedIn from an isolated browser on the server. Your password is encrypted
        (AES-256-GCM) before it is stored and is only used to refresh an expired session. If LinkedIn asks for
        verification, log in manually once and try again.
      </div>
      {error ? (
        <p role="alert" className="form-hint" style={{ color: "var(--red)", marginBottom: 12 }}>{error}</p>
      ) : null}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="form-group">
          <label className="form-label" htmlFor="li-email">LinkedIn email</label>
          <input id="li-email" name="email" type="email" className="form-input" autoComplete="off" required disabled={pending} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-password">LinkedIn password</label>
          <input id="li-password" name="password" type="password" className="form-input" autoComplete="new-password" required disabled={pending} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-label">Account label (optional)</label>
          <input id="li-label" name="label" className="form-input" placeholder="e.g. Ashish — Sales" disabled={pending} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-limit">Daily connection limit</label>
          <select id="li-limit" name="daily_limit" className="form-input form-select" defaultValue="10" disabled={pending}>
            <option value="10">10 (Recommended — safest)</option>
            <option value="8">8</option>
            <option value="6">6</option>
          </select>
          <div className="form-hint">Capped by your workspace plan. Conservative limits keep the account healthy.</div>
        </div>
        <button type="submit" hidden />
      </form>
    </ModalShell>
  );
}
