"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RemoteBrowserViewProps = {
  sessionId: string;
  onError: (message: string) => void;
};

type InputEvent =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; deltaY: number };

/** Keys forwarded as key presses; printable characters are forwarded as text. */
const FORWARDED_KEYS = new Set([
  "Enter",
  "Backspace",
  "Delete",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/** How long to wait before asking for the next picture when nothing is happening. */
const IDLE_FRAME_MS = 250;
const MAX_BATCH = 40;

/**
 * Shows the LinkedIn sign-in page that is running in a browser on the Reachly server, and sends the
 * user's clicks and keystrokes to it. Nothing is stored here.
 *
 * Speed matters more than anything else in this view, so:
 * - input goes out as soon as the previous request returns, with everything typed meanwhile in one batch;
 * - a new picture is requested immediately after each batch, and unchanged pictures cost only a 304.
 */
export function RemoteBrowserView({ sessionId, onError }: RemoteBrowserViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [text, setText] = useState("");
  /** Shown from the first keystroke until the server has replayed it, so typing never feels ignored. */
  const [sending, setSending] = useState(false);
  const [ripple, setRipple] = useState<{ left: number; top: number; id: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pending = useRef<InputEvent[]>([]);
  const inFlight = useRef(false);
  /** Wakes the picture loop early (after input was replayed). */
  const wake = useRef<(() => void) | null>(null);
  const scroll = useRef(0);
  const scrollTimer = useRef<number | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let current: string | null = null;
    let tag: string | null = null;
    void (async () => {
      while (!stopped.current) {
        let wait = 1200;
        try {
          const res: Response = await fetch(`/accounts/browser/${sessionId}/frame`, {
            cache: "no-store",
            headers: tag ? { "If-None-Match": tag } : undefined,
          });
          if (res.status === 304) {
            wait = IDLE_FRAME_MS;
          } else if (res.ok) {
            tag = res.headers.get("ETag");
            const next = URL.createObjectURL(await res.blob());
            if (stopped.current) {
              URL.revokeObjectURL(next);
              break;
            }
            const previous = current;
            current = next;
            setFrame(next);
            if (previous) URL.revokeObjectURL(previous);
            wait = 60; // the page is changing: keep up with it
          }
        } catch {
          // network hiccup: try again below
        }
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, wait);
          wake.current = () => {
            window.clearTimeout(timer);
            resolve();
          };
        });
        wake.current = null;
      }
    })();
    return () => {
      stopped.current = true;
      wake.current?.();
      if (current) URL.revokeObjectURL(current);
    };
  }, [sessionId]);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (pending.current.length && !stopped.current) {
        const events = pending.current.splice(0, MAX_BATCH);
        try {
          const res = await fetch(`/accounts/browser/${sessionId}/input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }),
          });
          // 404: the sign-in has just finished (or was cancelled); the dialog is about to move on.
          if (!res.ok && res.status !== 404) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            onError(body?.error ?? "Could not send that to the sign-in page.");
          }
        } catch {
          onError("Connection problem. What you just typed may not have reached the sign-in page.");
        }
        wake.current?.();
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [sessionId, onError]);

  const send = useCallback(
    (event: InputEvent) => {
      const last = pending.current[pending.current.length - 1];
      // Keystrokes typed while a request is in flight travel together as one piece of text.
      if (event.type === "type" && last?.type === "type" && last.text.length + event.text.length <= 500) {
        last.text += event.text;
      } else {
        pending.current.push(event);
      }
      setSending(true);
      void flush();
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth) return;
    surfaceRef.current?.focus();
    const rect = image.getBoundingClientRect();
    setRipple({ left: e.clientX - rect.left, top: e.clientY - rect.top, id: Date.now() });
    send({
      type: "click",
      x: Math.round(((e.clientX - rect.left) * image.naturalWidth) / rect.width),
      y: Math.round(((e.clientY - rect.top) * image.naturalHeight) / rect.height),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave shortcuts (including paste) to the browser
    if (e.key.length === 1) {
      e.preventDefault();
      send({ type: "type", text: e.key });
    } else if (FORWARDED_KEYS.has(e.key)) {
      e.preventDefault();
      send({ type: "key", key: e.key });
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    send({ type: "type", text: pasted.slice(0, 500) });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    scroll.current += e.deltaY;
    if (scrollTimer.current !== null) return;
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null;
      const deltaY = Math.round(scroll.current);
      scroll.current = 0;
      if (deltaY) send({ type: "scroll", deltaY });
    }, 120);
  };

  const sendText = () => {
    if (!text) return;
    send({ type: "type", text });
    setText("");
  };

  return (
    <div>
      <div
        ref={surfaceRef}
        tabIndex={0}
        role="application"
        aria-label="LinkedIn sign-in page. Click a field in the picture, then type."
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onWheel={onWheel}
        style={{
          position: "relative",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--bg)",
          outlineOffset: 2,
          lineHeight: 0,
        }}
      >
        {frame ? (
          // eslint-disable-next-line @next/next/no-img-element -- a live blob URL, not an optimisable asset
          <img
            ref={imageRef}
            src={frame}
            alt="LinkedIn sign-in page"
            onClick={onClick}
            draggable={false}
            style={{ width: "100%", height: "auto", display: "block", cursor: "pointer" }}
          />
        ) : (
          <div
            role="status"
            style={{ aspectRatio: "1024 / 720", display: "grid", placeItems: "center", lineHeight: 1.4 }}
            className="form-hint"
          >
            Loading LinkedIn…
          </div>
        )}
        {ripple ? (
          <span
            key={ripple.id}
            aria-hidden="true"
            onAnimationEnd={() => setRipple(null)}
            style={{
              position: "absolute",
              left: ripple.left - 9,
              top: ripple.top - 9,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid var(--primary)",
              pointerEvents: "none",
              animation: "reachly-click-ripple .45s ease-out forwards",
            }}
          />
        ) : null}
        {sending ? (
          <span
            role="status"
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              padding: "4px 8px",
              borderRadius: 6,
              background: "var(--card)",
              border: "1px solid var(--border)",
              fontSize: 11.5,
              lineHeight: 1.3,
              color: "var(--fg2)",
            }}
          >
            Sending…
          </span>
        ) : null}
        <style>{"@keyframes reachly-click-ripple{from{transform:scale(.4);opacity:1}to{transform:scale(1.8);opacity:0}}"}</style>
      </div>
      <div className="form-hint" style={{ marginTop: 8 }}>
        Click a field in the picture, then type. If typing does not reach it (for example on a phone), use
        the box below.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ flex: "1 1 200px", minWidth: 0 }}
          aria-label="Text to type into the selected LinkedIn field"
          placeholder="Type here, then Send to field"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendText();
            }
          }}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={sendText}>
          Send to field
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => send({ type: "key", key: "Enter" })}>
          Press Enter
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => send({ type: "key", key: "Backspace" })}>
          Backspace
        </button>
      </div>
    </div>
  );
}
