"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserConnectInputAction } from "@/app/(app)/accounts/actions";
import type { BrowserConnectInput } from "@/lib/accounts/repository";

type RemoteBrowserViewProps = {
  sessionId: string;
  onError: (message: string) => void;
};

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

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Shows the LinkedIn sign-in page that is running in a browser on the Reachly server, and sends the
 * user's clicks and keystrokes to it. The picture is refreshed continuously; nothing is stored here.
 */
export function RemoteBrowserView({ sessionId, onError }: RemoteBrowserViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [text, setText] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  /** Actions are sent one after another so they replay in the order the user made them. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const typed = useRef("");
  const typedTimer = useRef<number | null>(null);
  const scroll = useRef(0);
  const scrollTimer = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let current: string | null = null;
    void (async () => {
      while (!stopped) {
        let ok = false;
        try {
          const res = await fetch(`/accounts/browser/${sessionId}/frame`, { cache: "no-store" });
          if (res.ok) {
            const next = URL.createObjectURL(await res.blob());
            if (stopped) {
              URL.revokeObjectURL(next);
              break;
            }
            const previous = current;
            current = next;
            setFrame(next);
            if (previous) URL.revokeObjectURL(previous);
            ok = true;
          }
        } catch {
          // network hiccup: try again below
        }
        await sleep(ok ? 350 : 1200);
      }
    })();
    return () => {
      stopped = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [sessionId]);

  const send = useCallback(
    (input: BrowserConnectInput) => {
      queue.current = queue.current.then(async () => {
        const result = await browserConnectInputAction(sessionId, input);
        if (result.error) onError(result.error);
      });
    },
    [sessionId, onError],
  );

  const flushTyped = useCallback(() => {
    if (typedTimer.current !== null) window.clearTimeout(typedTimer.current);
    typedTimer.current = null;
    const pending = typed.current;
    typed.current = "";
    if (pending) send({ type: "type", text: pending });
  }, [send]);

  const queueText = useCallback(
    (value: string) => {
      typed.current += value;
      if (typedTimer.current !== null) window.clearTimeout(typedTimer.current);
      typedTimer.current = window.setTimeout(flushTyped, 250);
    },
    [flushTyped],
  );

  useEffect(
    () => () => {
      if (typedTimer.current !== null) window.clearTimeout(typedTimer.current);
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth) return;
    surfaceRef.current?.focus();
    const rect = image.getBoundingClientRect();
    flushTyped();
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
      queueText(e.key);
    } else if (FORWARDED_KEYS.has(e.key)) {
      e.preventDefault();
      flushTyped();
      send({ type: "key", key: e.key });
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    queueText(pasted.slice(0, 500));
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    scroll.current += e.deltaY;
    if (scrollTimer.current !== null) return;
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null;
      const deltaY = Math.round(scroll.current);
      scroll.current = 0;
      if (deltaY) send({ type: "scroll", deltaY });
    }, 150);
  };

  const sendText = () => {
    if (!text) return;
    flushTyped();
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
