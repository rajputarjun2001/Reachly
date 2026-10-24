"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";
import { AppModals } from "@/components/modals/app-modals";

type AppShellProps = {
  children: ReactNode;
  workspaceName: string;
  workspacePlan: string;
  workspaceInitials: string;
  showSignOut?: boolean;
  liveMode?: boolean;
};

export function AppShell({
  children,
  workspaceName,
  workspacePlan,
  workspaceInitials,
  showSignOut,
  liveMode,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="reachly-shell">
      <Sidebar
        mobileOpen={mobileOpen}
        workspaceName={workspaceName}
        workspacePlan={workspacePlan}
        workspaceInitials={workspaceInitials}
        showSignOut={showSignOut}
        liveMode={liveMode}
      />
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
      <AppModals liveMode={liveMode} />
    </div>
  );
}
