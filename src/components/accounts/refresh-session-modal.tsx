"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modals/modal-shell";
import { reconnectAccountAction } from "@/app/(app)/accounts/actions";

type RefreshSessionModalProps = {
  open: boolean;
  accountName: string;
  accountId: string;
  onClose: () => void;
};

export function RefreshSessionModal({ open, accountName, accountId, onClose }: RefreshSessionModalProps) {
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
    const sessionCookies = String(new FormData(form).get("session_cookies") ?? "").trim();
    setError(null);
    startTransition(async () => {
      const result = await reconnectAccountAction(accountId, { sessionCookies });
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
      onClose={() => !pending && onClose()}
      title="Update session cookies"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save session"}
          </button>
        </>
      }
    >
      <p className="form-hint" style={{ marginBottom: 12 }}>
        Paste fresh session cookies for <strong>{accountName}</strong> after signing in at linkedin.com—include{" "}
        <strong>li_at</strong> and <strong>JSESSIONID</strong>, or a full DevTools export. Reachly encrypts cookies at
        rest and never stores your password for this path.
      </p>
      {error ? (
        <p role="alert" className="form-hint" style={{ color: "var(--red)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="form-group">
          <label className="form-label" htmlFor="refresh-session-cookies">
            Session cookies
          </label>
          <textarea
            id="refresh-session-cookies"
            name="session_cookies"
            className="form-input"
            rows={5}
            required
            disabled={pending}
            placeholder="li_at=…; JSESSIONID=… or JSON export from DevTools → Application → Cookies → .linkedin.com"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button type="submit" hidden />
      </form>
    </ModalShell>
  );
}
