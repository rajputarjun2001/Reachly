"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ModalId =
  | "newCampaign"
  | "addAccount"
  | "uploadLeads"
  | "leadDetail";

type ModalContextValue = {
  openModal: (id: ModalId) => void;
  closeModal: (id: ModalId) => void;
  isOpen: (id: ModalId) => boolean;
};

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Record<ModalId, boolean>>({
    newCampaign: false,
    addAccount: false,
    uploadLeads: false,
    leadDetail: false,
  });

  const openModal = useCallback((id: ModalId) => {
    setOpen((prev) => ({ ...prev, [id]: true }));
  }, []);

  const closeModal = useCallback((id: ModalId) => {
    setOpen((prev) => ({ ...prev, [id]: false }));
  }, []);

  const isOpen = useCallback((id: ModalId) => open[id], [open]);

  const value = useMemo(
    () => ({ openModal, closeModal, isOpen }),
    [openModal, closeModal, isOpen],
  );

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
}

export function useModals() {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error("useModals must be used within ModalProvider");
  }
  return ctx;
}
