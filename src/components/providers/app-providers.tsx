"use client";

import type { ReactNode } from "react";
import { ModalProvider } from "@/context/modal-context";
import { PreviewModeProvider } from "@/context/preview-mode-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreviewModeProvider>
      <ModalProvider>{children}</ModalProvider>
    </PreviewModeProvider>
  );
}
