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
  verifyAccountAction,
} from "@/app/(app)/accounts/actions";
import type { AccountVerification } from "@/lib/accounts/types";
import { RemoteBrowserView } from "@/components/accounts/remote-browser-view";

type ConnectAccountModalProps = {
  open: boolean;
  onClose: () => void;
  linkedinOAuthEnabled?: boolean;
  /**
   * How the server offers "Sign in with browser": "remote" streams LinkedIn's page into this dialog
   * (works when deployed); "window" opens Chromium on the server machine (local development only).
   */
  browserSignIn?: "window" | "remote" | "off";
};

type Mode = "oauth" | "password" | "browser" | "cookies";

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function defaultMode(oauth: boolean): Mode {
  if (oauth) return "oauth";
  return "cookies";
}

export function ConnectAccountModal({
  open,
  onClose,
  linkedinOAuthEnabled = false,
  browserSignIn = "off",
}: ConnectAccountModalProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * A window on the server machine is only visible when that machine is this computer, so "window" mode
   * is offered on localhost only; "remote" mode works anywhere.
   * SSR and first paint must match; detect localhost after mount to avoid hydration mismatch.
   */
  const [onLocalHost, setOnLocalHost] = useState(false);
  const browserConnectAvailable = browserSignIn === "remote" || (browserSignIn === "window" && onLocalHost);
  /** Set once a sign-in starts: whether its page is streamed here or shown in a window on the server. */
  const [browserMode, setBrowserMode] = useState<"window" | "remote" | null>(null);
  /** LinkedIn has signed the user in and Reachly is verifying and saving the session. */
  const [browserSaving, setBrowserSaving] = useState(false);
  const [mode, setMode] = useState<Mode>(() => defaultMode(linkedinOAuthEnabled));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [browserStatus, setBrowserStatus] = useState<string | null>(null);
  /** Set while LinkedIn is waiting for the owner to verify a password sign-in. */
  const [verification, setVerification] = useState<AccountVerification | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setOnLocalHost(isLocalHost());
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setMode(defaultMode(linkedinOAuthEnabled));
      setBrowserSessionId(null);
      setBrowserStatus(null);
      setBrowserMode(null);
      setBrowserSaving(false);
      setVerification(null);
      setCode("");
      formRef.current?.reset();
    }
  }, [open, linkedinOAuthEnabled]);

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
        setBrowserSaving(Boolean(result.saving));
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
  /** LinkedIn's sign-in page is being shown inside this dialog. */
  const streaming = Boolean(browserSessionId) && browserMode === "remote";

  const submitPassword = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await connectAccountAction(formData);
      if (result.verification) {
        setError(null);
        setCode("");
        setVerification(result.verification);
        router.refresh();
        return;
      }
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const submitVerification = () => {
    if (!verification) return;
    if (verification.kind === "code" && !code.trim()) {
      setError("Enter the verification code LinkedIn sent you.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await verifyAccountAction(verification.accountId, verification.kind === "code" ? code : undefined);
      if (result.verification) {
        setVerification(result.verification);
        setError(result.error ?? "LinkedIn is still waiting for you to approve the sign-in.");
        return;
      }
      if (result.error) {
        // The sign-in is over (expired, CAPTCHA, ...): go back to the form with the reason.
        setVerification(null);
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
        setBrowserMode(result.mode ?? "window");
        setBrowserSaving(false);
      }
    });
  };

  const submitOAuth = () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    const params = new URLSearchParams();
    const label = String(formData.get("label") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const dailyLimit = String(formData.get("daily_limit") ?? "").trim();
    if (label) params.set("label", label);
    if (email) params.set("email", email);
    if (dailyLimit) params.set("daily_limit", dailyLimit);
    window.location.assign(`/auth/linkedin/start?${params.toString()}`);
  };

  const submit = () => {
    if (mode === "oauth") submitOAuth();
    else if (mode === "password") submitPassword();
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
      size={streaming ? "xl" : "default"}
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
          {verification ? (
            <button type="button" className="btn btn-primary" onClick={submitVerification} disabled={busy}>
              {pending ? "Checking…" : verification.kind === "code" ? "Verify code" : "I have approved it"}
            </button>
          ) : mode === "oauth" ? (
            <button type="button" className="btn btn-primary" onClick={submitOAuth} disabled={busy}>
              Continue with LinkedIn
            </button>
          ) : mode === "password" ? (
            <button type="button" className="btn btn-primary" onClick={submitPassword} disabled={busy}>
              {pending ? "Signing in…" : "Connect with password"}
            </button>
          ) : mode === "cookies" ? (
            <button type="button" className="btn btn-primary" onClick={submitCookies} disabled={busy}>
              {pending ? "Verifying…" : "Connect with session"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submitBrowser} disabled={busy}>
              {browserSessionId
                ? browserSaving
                  ? "Saving session…"
                  : streaming
                  ? "Waiting for you to sign in…"
                  : "Waiting for LinkedIn…"
                : pending
                  ? "Opening browser…"
                  : "Open LinkedIn sign-in"}
            </button>
          )}
        </>
      }
    >
      {verification ? (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              background: "var(--blue-light)",
              border: "1px solid #BFDBFE",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 12.5,
              color: "#1E40AF",
            }}
          >
            {verification.message}
            {verification.hint ? (
              <>
                {" "}
                LinkedIn says: <em>&ldquo;{verification.hint}&rdquo;</em>
              </>
            ) : null}
          </div>
          {verification.kind === "code" ? (
            <div className="form-group">
              <label className="form-label" htmlFor="li-verification-code">
                Verification code
              </label>
              <input
                id="li-verification-code"
                className="form-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitVerification();
                }}
                disabled={busy}
                autoFocus
              />
              <div className="form-hint">
                The sign-in stays open for 10 minutes. If the code expires, close this and connect again.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {streaming && browserSessionId ? (
        <div style={{ marginBottom: 12 }}>
          {browserSaving ? null : (
            <p className="form-hint" style={{ marginBottom: 10 }}>
              Sign in to LinkedIn below. This closes by itself once you reach your feed. The sign-in stays open for
              15 minutes.
            </p>
          )}
          {browserSaving ? (
            <p role="status" style={{ padding: "48px 0", textAlign: "center", fontWeight: 600 }}>
              Signed in. Saving your LinkedIn session…
            </p>
          ) : (
            <RemoteBrowserView sessionId={browserSessionId} onError={setError} />
          )}
        </div>
      ) : null}
      {error && (verification || streaming) ? (
        // The form below (and its error line) is hidden during these steps, so show the error here.
        <p role="alert" className="form-hint" style={{ color: "var(--red)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}
      <div hidden={Boolean(verification) || streaming}>
      <div className="flex-center gap-8" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {linkedinOAuthEnabled ? (
          <button
            type="button"
            className={`btn btn-sm ${mode === "oauth" ? "btn-primary" : "btn-outline"}`}
            onClick={() => !busy && setMode("oauth")}
            disabled={busy}
          >
            Sign In with LinkedIn
          </button>
        ) : null}
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

      {mode === "oauth" ? (
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
          Uses LinkedIn&apos;s official Sign In (OIDC) to verify who you are—no password stored on our servers.
          After you return here, paste <strong>session cookies</strong> (or use browser sign-in locally) so campaigns
          and Unibox can run; OAuth alone does not send connection requests.
        </div>
      ) : mode === "browser" ? (
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
          {browserSignIn === "remote" ? (
            <>
              LinkedIn&apos;s own sign-in page opens here, running in a browser on Reachly&apos;s server. You sign in
              yourself, including any verification code or puzzle LinkedIn asks for, and Reachly saves the session when
              you reach your feed. What you type is sent to that browser; Reachly does not store your password.
            </>
          ) : (
            <>
              A <strong>separate Chromium window</strong> opens on the PC where <code>npm run dev</code> is running
              (check your taskbar—it is not inside this browser tab). First time? Run{" "}
              <code>npm run browsers:install</code> once, then restart the dev server. If no window appears, use{" "}
              <strong>Paste session cookies</strong> instead. If you are already signed in to LinkedIn there, Reachly
              saves the session when you land on the feed; otherwise sign in and complete verification.
            </>
          )}
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
          in your browser, then open DevTools → Application → Cookies → <code>.linkedin.com</code> and paste{" "}
          <code>li_at</code> and <code>JSESSIONID</code> (or export the full cookie list as JSON). Reachly verifies the
          session from the server and stores it encrypted—ideal for deployed hosts like Render.
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

      {browserSessionId && !streaming ? (
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
            required={mode !== "oauth"}
            disabled={busy}
          />
          <div className="form-hint">
            {mode === "oauth"
              ? "Required if LinkedIn does not share your email in OIDC. Otherwise we use the verified address from LinkedIn."
              : mode === "password"
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
              placeholder="li_at=…; JSESSIONID=… or JSON cookie export"
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
        {mode !== "oauth" ? (
          <div className="form-group">
            <label className="form-label" htmlFor="li-proxy">
              Proxy (optional)
            </label>
            <input
              id="li-proxy"
              name="proxy_url"
              className="form-input"
              placeholder="http://user:pass@host:port or host:port:user:pass"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <div className="form-hint">
              A residential proxy in this account&apos;s own country, with a sticky (non-rotating) IP. Without one,
              LinkedIn sees the session arrive from the server&apos;s datacenter IP and may reject it. Stored encrypted.
            </div>
          </div>
        ) : null}
        <button type="submit" hidden />
      </form>
      </div>
    </ModalShell>
  );
}
