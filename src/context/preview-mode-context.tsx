"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PreviewModeContextValue = {
  emptyMode: boolean;
  toggleEmptyMode: () => void;
};

const PreviewModeContext = createContext<PreviewModeContextValue | null>(null);

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const [emptyMode, setEmptyMode] = useState(false);

  const toggleEmptyMode = useCallback(() => {
    setEmptyMode((v) => !v);
  }, []);

  const value = useMemo(
    () => ({ emptyMode, toggleEmptyMode }),
    [emptyMode, toggleEmptyMode],
  );

  return (
    <PreviewModeContext.Provider value={value}>
      {children}
    </PreviewModeContext.Provider>
  );
}

export function usePreviewMode() {
  const ctx = useContext(PreviewModeContext);
  if (!ctx) {
    throw new Error("usePreviewMode must be used within PreviewModeProvider");
  }
  return ctx;
}
