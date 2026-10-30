"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modals/modal-shell";
import {
  cancelBrowserConnectAction,
  connectAccountAction,
  connectAccountWithSessionCookiesAction,
  pollBrowserConnectAction,
  startBrowserConnectAction,
} from "@/app/(app)/accounts/actions";

type ConnectAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

type Mode = "password" | "browser" | "cookies";

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function ConnectAccountModal({ open, onClose }: ConnectAccountModalProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const browserConnectAvailable = typeof window !== "undefined" && isLocalHost();
  const [mode, setMode] = useState<Mode>("cookies");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [browserStatus, setBrowserStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setMode(browserConnectAvailable ? "browser" : "cookies");
      setBrowserSessionId(null);
      setBrowserStatus(null);
      formRef.current?.reset();
    }
  }, [open, browserConnectAvailable]);

  useEffect(() => {
    if (!browserConnectAvailable || !browserSessionId || browserStatus === "success" || browserStatus === "failed" || browserStatus === "cancelled") {
      return;
    }
    const id = window.setInterval(() => {
      void pollBrowserConnectAction(browserSessionId).then((result) => {
        if (result.error) {
          setError(result.error);
          setBrowserSessionId(null);
          return;
        }
        setBrowserStatus(result.status ?? null);
        if (result.status === "success") {
          setBrowserSessionId(null);
          onClose();
          router.refresh();
        }
        if (result.status === "failed") {
          setError(result.error ?? "LinkedIn sign-in did not complete.");
          setBrowserSessionId(null);
        }
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [browserConnectAvailable, browserSessionId, browserStatus, onClose, router]);

  const busy = pending || Boolean(browserSessionId);

  const submitPassword = () => {
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

  const submitCookies = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await connectAccountWithSessionCookiesAction(formData);
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const submitBrowser = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    if (password) formData.delete("password");
    setError(null);
    startTransition(async () => {
      const result = await startBrowserConnectAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.sessionId) {
        setBrowserSessionId(result.sessionId);
        setBrowserStatus("pending");
      }
    });
  };

  const submit = () => {
    if (mode === "password") submitPassword();
    else if (mode === "cookies") submitCookies();
    else submitBrowser();
  };

  const cancelBrowser = () => {
    if (!browserSessionId) return;
    void cancelBrowserConnectAction(browserSessionId).then(() => {
      setBrowserSessionId(null);
      setBrowserStatus("cancelled");
      setError(null);
    });
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title="Connect LinkedIn Account"
      footer={
        <>
          {browserSessionId ? (
            <button type="button" className="btn btn-outline" onClick={cancelBrowser}>
              Cancel sign-in
            </button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={handleClose} disabled={busy}>
              Close
            </button>
          )}
          {mode === "password" ? (
            <button type="button" className="btn btn-primary" onClick={submitPassword} disabled={busy}>
              {pending ? "Signing in…" : "Connect with password"}
            </button>
          ) : mode === "cookies" ? (
            <button type="button" className="btn btn-primary" onClick={submitCookies} disabled={busy}>
              {pending ? "Verifying…" : "Connect with session"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submitBrowser} disabled={busy}>
              {browserSessionId ? "Waiting for LinkedIn…" : pending ? "Opening browser…" : "Open LinkedIn sign-in"}
            </button>
          )}
        </>
      }
    >
      <div className="flex-center gap-8" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {browserConnectAvailable ? (
          <button
            type="button"
            className={`btn btn-sm ${mode === "browser" ? "btn-primary" : "btn-outline"}`}
            onClick={() => !busy && setMode("browser")}
            disabled={busy}
          >
            Sign in with browser
          </button>
        ) : null}
        <button
          type="button"
          className={`btn btn-sm ${mode === "cookies" ? "btn-primary" : "btn-outline"}`}
          onClick={() => !busy && setMode("cookies")}
          disabled={busy}
        >
          Paste session cookies
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === "password" ? "btn-primary" : "btn-outline"}`}
          onClick={() => !busy && setMode("password")}
          disabled={busy}
        >
          Email & password
        </button>
      </div>

      {mode === "browser" ? (
        <div
          style={{
            background: "var(--green-light, #ecfdf5)",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 20,
            fontSize: 12.5,
            color: "#065f46",
          }}
        >
          A Chromium window opens on the machine running Reachly (your PC when using <code>npm run dev</code>). If you
          are already signed in to LinkedIn there, you may land on the feed right away and Reachly will save the session
          automatically. Otherwise sign in and complete verification—the window closes when done and we store encrypted
          session cookies only (no password).
        </div>
      ) : mode === "cookies" ? (
        <div
          style={{
            background: "var(--green-light, #ecfdf5)",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 20,
            fontSize: 12.5,
            color: "#065f46",
          }}
        >
          Sign in at{" "}
          <a href="https://www.linkedin.com/login" target="_blank" rel="noopener noreferrer">
            linkedin.com
          </a>{" "}
          in your browser, then open DevTools → Application → Cookies → <code>linkedin.com</code> and copy{" "}
          <code>li_at</code> (or export cookies as JSON). Reachly verifies the session from the server and stores it
          encrypted—ideal for deployed hosts like Render.
        </div>
      ) : (
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
          Reachly signs in from the server using your password. It is encrypted (AES-256-GCM) and used only to refresh
          expired sessions. Cloud hosts may block this; prefer paste session cookies when password login fails.
        </div>
      )}

      {browserSessionId ? (
        <p role="status" className="form-hint" style={{ marginBottom: 12 }}>
          Complete sign-in in the LinkedIn browser window. This page updates when the session is saved.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="form-hint" style={{ color: "var(--red)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="form-group">
          <label className="form-label" htmlFor="li-email">
            LinkedIn email
          </label>
          <input
            id="li-email"
            name="email"
            type="email"
            className="form-input"
            autoComplete="off"
            required
            disabled={busy}
          />
          <div className="form-hint">
            {mode === "password"
              ? "Used to identify this seat in your workspace."
              : "Used to identify this seat in your workspace (session import does not store your password)."}
          </div>
        </div>
        {mode === "password" ? (
          <div className="form-group">
            <label className="form-label" htmlFor="li-password">
              LinkedIn password
            </label>
            <input
              id="li-password"
              name="password"
              type="password"
              className="form-input"
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </div>
        ) : null}
        {mode === "cookies" ? (
          <div className="form-group">
            <label className="form-label" htmlFor="li-session-cookies">
              Session cookies
            </label>
            <textarea
              id="li-session-cookies"
              name="session_cookies"
              className="form-input"
              rows={5}
              required
              disabled={busy}
              placeholder="Paste li_at or JSON cookie export"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        ) : null}
        <div className="form-group">
          <label className="form-label" htmlFor="li-label">
            Account label (optional)
          </label>
          <input id="li-label" name="label" className="form-input" placeholder="e.g. Ashish — Sales" disabled={busy} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-limit">
            Daily connection limit
          </label>
          <select id="li-limit" name="daily_limit" className="form-input form-select" defaultValue="10" disabled={busy}>
            <option value="10">10 (Recommended — safest)</option>
            <option value="8">8</option>
            <option value="6">6</option>
          </select>
        </div>
        <button type="submit" hidden />
      </form>
    </ModalShell>
  );
}
