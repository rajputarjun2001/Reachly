"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  LayoutGrid,
  MessageSquare,
  Settings,
  Users,
  UserSquare2,
  Megaphone,
} from "lucide-react";
import { appRoutes } from "@/lib/routes";
import { usePreviewMode } from "@/context/preview-mode-context";
import { cn } from "@/lib/cn";

const mainNav = [
  { href: appRoutes.dashboard, label: "Dashboard", icon: LayoutGrid },
  { href: appRoutes.campaigns, label: "Campaigns", icon: Megaphone },
  { href: appRoutes.leads, label: "Lead Lists", icon: Users },
  { href: appRoutes.unibox, label: "Unibox", icon: MessageSquare, demoBadge: 5 },
] as const;

const accountNav = [
  { href: appRoutes.accounts, label: "LinkedIn Accounts", icon: UserSquare2 },
  { href: appRoutes.analytics, label: "Analytics", icon: BarChart3 },
  { href: appRoutes.settings, label: "Settings", icon: Settings },
] as const;

type SidebarProps = {
  mobileOpen?: boolean;
  workspaceName: string;
  workspacePlan: string;
  workspaceInitials: string;
  showSignOut?: boolean;
  supabaseConfigured?: boolean;
};

function isActive(pathname: string, href: string) {
  if (href === appRoutes.campaigns) {
    return pathname === href || pathname.startsWith("/campaigns/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  mobileOpen,
  workspaceName,
  workspacePlan,
  workspaceInitials,
  showSignOut,
  supabaseConfigured,
}: SidebarProps) {
  const pathname = usePathname();
  const { emptyMode, toggleEmptyMode } = usePreviewMode();

  return (
    <nav
      className={cn("sidebar", mobileOpen && "mobile-open")}
      id="sidebar"
      aria-label="Main navigation"
    >
      <div className="sidebar-logo">
        <div className="logo-mark">R</div>
        <div className="logo-name">
          Reach<span>ly</span>
        </div>
      </div>
      <div className="sidebar-nav">
        <div className="nav-label">Main</div>
        {mainNav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn("nav-item", active && "active")}
              style={{ textDecoration: "none" }}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              {item.label}
              {"demoBadge" in item && item.demoBadge && !supabaseConfigured ? (
                <span className="nav-badge">{item.demoBadge}</span>
              ) : null}
            </Link>
          );
        })}
        <div className="nav-label" style={{ marginTop: 12 }}>
          Account
        </div>
        {accountNav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn("nav-item", active && "active")}
              style={{ textDecoration: "none" }}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <div style={{ padding: "0 10px 10px" }}>
          <button
            type="button"
            id="emptyToggleBtn"
            onClick={toggleEmptyMode}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 8,
              border: "1px dashed var(--border)",
              background: "transparent",
              color: "var(--fg2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            👁 Preview: <span id="emptyToggleLabel">{emptyMode ? "Empty" : "Populated"}</span>
          </button>
        </div>
        {showSignOut ? (
          <form action="/auth/signout" method="post" style={{ padding: "0 10px 8px" }}>
            <button type="submit" className="btn btn-outline btn-sm" style={{ width: "100%" }}>
              Sign out
            </button>
          </form>
        ) : null}
        <div className="workspace-pill">
          <div className="ws-avatar">{workspaceInitials}</div>
          <div className="ws-info">
            <div className="ws-name">{workspaceName}</div>
            <div className="ws-plan">{workspacePlan}</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
