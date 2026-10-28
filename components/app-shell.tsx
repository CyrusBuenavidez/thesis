"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PrivacyNoticeModal } from "@/components/privacy-notice-modal";
import type { UserRole } from "@/lib/auth/roles";
import { signOutAction } from "@/app/login/actions";

// Icons matching user interface specification
function DashboardIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}


function ThesisManagementIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ReviewManagerIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function RepositoryIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SystemManagerIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MenuBarsIcon() {
  return (
    <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function BreadcrumbHomeIcon() {
  return (
    <svg
      className="w-4 h-4 text-slate-500 group-hover:text-[#1616D4] transition-colors"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5L12 3l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function isDashboardRoute(path: string | null): boolean {
  if (!path) return false;
  const clean = path.replace(/\/+$/, "");
  return clean === "/dashboard";
}

function formatSegmentName(seg: string): string {
  return seg
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getBreadcrumbs(path: string | null): { label: string; href?: string }[] {
  if (!path || isDashboardRoute(path)) return [];

  const cleanPath = path.replace(/\/+$/, "");
  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const primarySlug = segments[0];

  const primaryMap: Record<string, string> = {
    users: "Users",
    "thesis-management": "Thesis Management",
    repository: "Repository",
    "review-manager": "Review Manager",
    settings: "System Settings",
    "audit-logs": "Reports & Audit Logs",
    archive: "Repository",
  };

  const primaryLabel = primaryMap[primarySlug] || formatSegmentName(primarySlug);

  if (primarySlug === "settings") {
    const crumbs: { label: string; href?: string }[] = [
      { label: "System Settings", href: "/settings" },
      { label: "System Manager", href: "/settings" },
    ];
    if (segments.length > 1) {
      const tabLabels: Record<string, string> = {
        departments: "Departments",
        programs: "Programs",
        "senior-high-programs": "Senior High Programs",
        "senior-high": "Senior High Programs",
        branding: "Branding & CMS",
        "branding-cms": "Branding & CMS",
      };
      const tabName = tabLabels[segments[1]] || formatSegmentName(segments[1]);
      crumbs.push({ label: tabName });
    } else {
      crumbs.push({ label: "Departments" });
    }
    return crumbs;
  }

  if (segments.length === 1) {
    return [{ label: primaryLabel }];
  }

  const crumbs: { label: string; href?: string }[] = [];
  crumbs.push({ label: primaryLabel, href: `/${primarySlug}` });

  if (primarySlug === "users" && segments[1] === "change-password") {
    crumbs.push({ label: "Change Password" });
    return crumbs;
  }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    crumbs.push({
      label: formatSegmentName(seg),
      href: isLast ? undefined : `/${segments.slice(0, i + 1).join("/")}`,
    });
  }

  return crumbs;
}


export interface AppShellProps {
  children: ReactNode;
  userRole?: UserRole;
  userFullName?: string;
  userEmail?: string;
  needsPrivacyConsent?: boolean;
}

export function AppShell({
  children,
  userRole,
  userFullName,
  userEmail,
  needsPrivacyConsent,
}: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextPathname = usePathname();
  const [currentPath, setCurrentPath] = useState(nextPathname);

  useEffect(() => {
    setCurrentPath(nextPathname);
  }, [nextPathname]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const pathname = currentPath || nextPathname;
  const breadcrumbs = getBreadcrumbs(pathname);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Automatically reset mobile drawer when route changes during render
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
    setIsNotificationsOpen(false);
  }

  // Handle Escape key to close mobile drawer or notifications popover
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          menuButtonRef.current?.focus();
        }
        if (isNotificationsOpen) {
          setIsNotificationsOpen(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, isNotificationsOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const effectiveRole = userRole || "admin";
  const hasDashboardAccess = effectiveRole !== "student" && effectiveRole !== "advisor";

  const roleTitleMap: Record<UserRole, string> = {
    admin: "System Administrator",
    super_admin: "Super Administrator",
    advisor: "Faculty Advisor",
    librarian: "Academic Librarian",
    student: "Student Researcher",
  };

  const roleSubtitle = roleTitleMap[effectiveRole] || "Student Researcher";
  const displayName = userFullName || roleTitleMap[effectiveRole] || "Institutional User";

  return (
    <div className="app-shell">
      <PrivacyNoticeModal
        initialNeedsConsent={needsPrivacyConsent}
        userName={displayName}
      />

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar / Modules Menu */}
      <aside className={`sidebar ${isMobileMenuOpen ? "mobile-open" : ""}`}>
        {/* Mobile Close Button */}
        <div className="flex items-center justify-between lg:hidden mb-2">
          <div className="flex items-center gap-2">
            <Image
              src="/pecit-logo.png"
              alt="PECIT Seal"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-bold text-xs uppercase tracking-wider text-white">PECIT</span>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Profile Section matching User UI Screenshot */}
        <div className="sidebar-profile-card">
          <div className="sidebar-avatar-wrapper">
            <Image
              src="/avatar.png"
              alt="User Avatar"
              width={52}
              height={52}
              className="sidebar-avatar-img"
              priority
            />
          </div>
          <div className="sidebar-profile-info">
            <h3 className="sidebar-user-name" title={userEmail || displayName}>
              {displayName}
            </h3>
            <p className="sidebar-user-role" title={userEmail || undefined}>
              {roleSubtitle}
            </p>
          </div>
        </div>

        {/* Modules Menu Navigation */}
        <nav aria-label="Modules navigation" className="sidebar-nav">
          {/* Dashboard (Admin / Super Admin / Librarian) */}
          {(effectiveRole === "admin" || effectiveRole === "super_admin" || effectiveRole === "librarian") && (
            <Link
              href="/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`nav-link ${pathname?.startsWith("/dashboard") ? "active" : ""}`}
              aria-current={pathname?.startsWith("/dashboard") ? "page" : undefined}
            >
              <DashboardIcon />
              <span>Dashboard</span>
            </Link>
          )}

          {/* Users (Admin / Super Admin) */}
          {(effectiveRole === "admin" || effectiveRole === "super_admin") && (
            <Link
              href="/users"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`nav-link ${pathname?.startsWith("/users") ? "active" : ""}`}
              aria-current={pathname?.startsWith("/users") ? "page" : undefined}
            >
              <UsersIcon />
              <span>Users</span>
            </Link>
          )}

          {/* Thesis Management - ALWAYS AVAILABLE TO ALL USERS */}
          <Link
            href="/thesis-management"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-link ${pathname?.startsWith("/thesis-management") ? "active" : ""}`}
            aria-current={pathname?.startsWith("/thesis-management") ? "page" : undefined}
          >
            <ThesisManagementIcon />
            <span>Thesis Management</span>
          </Link>

          {/* Repository - Librarian / Admin / Super Admin / Advisor */}
          {(effectiveRole === "librarian" || effectiveRole === "admin" || effectiveRole === "super_admin" || effectiveRole === "advisor") && (
            <Link
              href="/repository"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`nav-link ${pathname?.startsWith("/repository") ? "active" : ""}`}
              aria-current={pathname?.startsWith("/repository") ? "page" : undefined}
            >
              <RepositoryIcon />
              <span>Repository</span>
            </Link>
          )}

          {/* Review Manager (Advisor / Librarian / Admin / Super Admin) */}
          {(effectiveRole === "advisor" || effectiveRole === "librarian" || effectiveRole === "admin" || effectiveRole === "super_admin") && (
            <Link
              href="/review-manager"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`nav-link ${pathname?.startsWith("/review-manager") ? "active" : ""}`}
              aria-current={pathname?.startsWith("/review-manager") ? "page" : undefined}
            >
              <ReviewManagerIcon />
              <span>Review Manager</span>
            </Link>
          )}

          {/* System Settings (Collapsible accordion matching User UI Screenshot) */}
          {(effectiveRole === "admin" || effectiveRole === "super_admin") && (
            <div className="nav-group">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`nav-link w-full justify-between cursor-pointer ${pathname?.startsWith("/settings") || pathname?.startsWith("/audit-logs")
                    ? "font-semibold"
                    : ""
                  }`}
                aria-expanded={isSettingsOpen}
              >
                <div className="flex items-center gap-3">
                  <SettingsIcon />
                  <span>System Settings</span>
                </div>
                <span className="text-xs transition-transform duration-200" aria-hidden="true">
                  {isSettingsOpen ? "▴" : "▾"}
                </span>
              </button>

              {isSettingsOpen && (
                <div className="nav-sub-menu">
                  <Link
                    href="/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`nav-sub-link ${pathname?.startsWith("/settings") ? "active" : ""}`}
                    aria-current={pathname?.startsWith("/settings") ? "page" : undefined}
                  >
                    <SystemManagerIcon />
                    <span>System Manager</span>
                  </Link>

                  <Link
                    href="/audit-logs"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`nav-sub-link ${pathname === "/audit-logs" ? "active" : ""}`}
                    aria-current={pathname === "/audit-logs" ? "page" : undefined}
                  >
                    <ReportsIcon />
                    <span>Reports</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Librarian Reports option */}
          {effectiveRole === "librarian" && (
            <Link
              href="/audit-logs"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`nav-link ${pathname?.startsWith("/audit-logs") ? "active" : ""}`}
              aria-current={pathname?.startsWith("/audit-logs") ? "page" : undefined}
            >
              <ReportsIcon />
              <span>Reports</span>
            </Link>
          )}
        </nav>

        {/* Sidebar Footer with Sign Out in red matching User Screenshot */}
        <div className="sidebar-footer">
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="sidebar-signout-btn cursor-pointer"
              title="Sign out of system"
            >
              <svg
                className="w-4 h-4 text-red-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Container */}
      <div className="shell-main">
        {/* Header matching User Screenshot */}
        <header className="site-header">
          {/* Left: 3-line Menu Button on Mobile/Tablet (< 1024px), invisible spacer on Desktop (>= 1024px) */}
          <div className="flex items-center shrink-0 w-10">
            <button
              ref={menuButtonRef}
              type="button"
              className="header-menu-btn lg:!hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
            >
              <MenuBarsIcon />
            </button>
          </div>

          {/* Center: Official PECIT Logo Seal + Institutional Repository Title */}
          <div className="header-identity flex items-center justify-center gap-2.5 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            <Image
              src="/pecit-logo.png"
              alt="PECIT Institutional Seal"
              width={38}
              height={38}
              className="header-logo-img object-contain shrink-0 w-8 h-8 sm:w-9 sm:h-9"
              priority
            />
            <div className="header-titles min-w-0 overflow-hidden text-left">
              <h1 className="header-title whitespace-nowrap overflow-hidden text-ellipsis text-sm sm:text-base md:text-lg font-black tracking-tight text-[#1616D4]">
                THESIS ARCHIVE SYSTEM
              </h1>
              <p className="header-subtitle hidden sm:block text-xs text-slate-500 font-semibold tracking-wider uppercase truncate">
                PHILIPPINE ELECTRONICS &amp; COMMUNICATION INSTITUTE OF TECHNOLOGY
              </p>
              <p className="header-subtitle sm:hidden text-xs text-slate-500 font-bold uppercase tracking-wider truncate">
                PECIT REPOSITORY
              </p>
            </div>
          </div>

          {/* Right: Notifications Bell */}
          <div className="flex items-center justify-end shrink-0 w-10 relative">

            <button
              type="button"
              className="header-bell-btn relative cursor-pointer"
              title="System notifications"
              aria-label="System notifications"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <BellIcon />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>

            {/* Notification Popover */}
            {isNotificationsOpen && (
              <div className="absolute right-0 top-12 w-[min(20rem,calc(100vw-1.5rem))] sm:w-88 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 p-4 text-left animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                      System Notifications
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                      2 New
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                    aria-label="Close notifications"
                  >
                    ✕
                  </button>
                </div>

                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto mt-2">
                  <div className="py-2.5 flex items-start gap-2.5 hover:bg-slate-50 p-2 rounded-xl transition-colors">
                    <span className="text-base shrink-0">📜</span>
                    <div className="flex-1 text-xs">
                      <p className="font-semibold text-slate-900 leading-snug">
                        PECIT Archive Operational
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Manuscript upload and faculty review pipeline active.
                      </p>
                      <span className="text-xs text-slate-400 font-mono mt-1 block">
                        Just now
                      </span>
                    </div>
                  </div>

                  <div className="py-2.5 flex items-start gap-2.5 hover:bg-slate-50 p-2 rounded-xl transition-colors">
                    <span className="text-base shrink-0">🛡️</span>
                    <div className="flex-1 text-xs">
                      <p className="font-semibold text-slate-900 leading-snug">
                        RA 10173 Audit Logging
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Append-only security and privacy policy synchronized.
                      </p>
                      <span className="text-xs text-slate-400 font-mono mt-1 block">
                        5m ago
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 mt-1 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    href="/audit-logs"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-semibold text-[#1616D4] hover:underline"
                  >
                    View Audit Trail →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content Body */}
        <main className="page-content">
          {/* Module Return Home/Dashboard Breadcrumb - on every module except the dashboard itself, only for roles with dashboard access */}
          {hasDashboardAccess && !isDashboardRoute(pathname) && pathname !== "/thesis-management" && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb navigation"
              className="module-breadcrumb-bar mb-4 sm:mb-5 flex items-center gap-2 text-xs sm:text-sm text-slate-500"
            >
              <Link
                href="/dashboard"
                className="breadcrumb-home-link inline-flex items-center justify-center p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:text-[#1616D4] hover:bg-slate-200/50 transition-colors group cursor-pointer"
                title="Return to Dashboard"
                aria-label="Return to Dashboard"
              >
                <BreadcrumbHomeIcon />
              </Link>
              <span className="breadcrumb-slash text-slate-300 font-normal select-none" aria-hidden="true">
                /
              </span>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return isLast ? (
                  <span
                    key={crumb.label}
                    className="font-medium text-slate-700 tracking-tight"
                    aria-current="page"
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <span key={crumb.label} className="flex items-center gap-2">
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="font-medium text-slate-500 hover:text-[#1616D4] transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-slate-500 font-medium">{crumb.label}</span>
                    )}
                    <span className="breadcrumb-slash text-slate-300 font-normal select-none" aria-hidden="true">
                      /
                    </span>
                  </span>
                );
              })}
            </nav>
          )}
          {children}
        </main>

        {/* Footer matching User Screenshot */}
        <footer className="site-footer">
          {/* Left: Data Privacy Act of 2012 compliance with NPC badge */}
          <div className="footer-privacy-wrapper flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2 sm:gap-3">
            <a
              href="https://privacy.gov.ph/"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 transition-opacity hover:opacity-85"
              title="National Privacy Commission"
            >
              <Image
                src="/npc-seal.png"
                alt="National Privacy Commission"
                width={75}
                height={38}
                className="npc-seal-img object-contain shrink-0"
              />
            </a>
            <div className="text-xs sm:text-sm leading-snug">
              <div>
                <a
                  href="https://privacy.gov.ph/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-privacy-title hover:underline font-bold text-[#1616D4]"
                >
                  Data Privacy Act of 2012 (RA 10173)
                </a>
              </div>
              <div className="footer-privacy-desc text-xs text-slate-500 mt-0.5">
                This system complies with RA 10173. Personal information is handled per{" "}
                <a
                  href="https://privacy.gov.ph/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1616D4] font-semibold hover:underline"
                >
                  NPC guidelines
                </a>
                .
              </div>
            </div>
          </div>

          {/* Right: Copyright */}
          <p className="footer-copyright text-xs text-slate-400 font-medium text-center sm:text-right w-full sm:w-auto">
            © 2026 THESIS ARCHIVE SYSTEM. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
