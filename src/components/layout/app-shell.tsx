"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { AppModals } from "@/components/modals/app-modals";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="reachly-shell">
      <Sidebar mobileOpen={mobileOpen} />
      <main className="main">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Open navigation menu"
          onClick={() => setMobileOpen((v) => !v)}
          style={{
            display: "none",
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 110,
          }}
          id="mobile-nav-toggle"
        >
          <Menu size={20} />
        </button>
        {children}
      </main>
      <AppModals />
    </div>
  );
}
