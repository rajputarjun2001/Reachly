"use client";

import { usePreviewMode } from "@/context/preview-mode-context";
import type { ReactNode } from "react";

type PreviewSwitchProps = {
  populated: ReactNode;
  empty: ReactNode;
};

export function PreviewSwitch({ populated, empty }: PreviewSwitchProps) {
  const { emptyMode } = usePreviewMode();
  return emptyMode ? empty : populated;
}
