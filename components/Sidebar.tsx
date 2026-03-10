"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useCurrentUser, useCurrentTenant } from "@/store/sessionStore";
import { useTenantCustomizationStore } from "@/store/tenantCustomizationStore";
import type { EntitlementKey, StaffRole } from "@/types/session";

const ROLE_COLORS: Record<StaffRole, { bg: string; text: string; border: string }> = {
  doctor:       { bg: "rgba(45,212,191,0.12)",  text: "#2DD4BF", border: "rgba(45,212,191,0.3)"  },
  technician:   { bg: "rgba(96,165,250,0.12)",  text: "#60A5FA", border: "rgba(96,165,250,0.3)"  },
  receptionist: { bg: "rgba(167,139,250,0.12)", text: "#A78BFA", border: "rgba(167,139,250,0.3)" },
  admin:        { bg: "rgba(251,191,36,0.12)",  text: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  owner:        { bg: "rgba(251,113,133,0.12)", text: "#FB7185", border: "rgba(251,113,133,0.3)" },
};

// ---------------------------------------------------------------------------
// Icon components
// ---------------------------------------------------------------------------

const Icon = {
  Dashboard: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="1" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1" y="9" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Calendar: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Patients: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 14c0-3.314 2.686-5.5 6-5.5s6 2.186 6 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Analytics: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 13L5.5 8.5l3 2.5L12 5l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Optical: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.5 8h-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Staff: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 13c0-2.761 2.015-4.5 4.5-4.5S10 10.239 10 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 13c0-2.21 1.343-3.5 3-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h8M14 4h0M2 8h3M9 8h5M2 12h10M14 12h0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Clipboard: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="2.5" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.5V2a2 2 0 014 0v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 7h4M6 9.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Billing: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="12" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Lock: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Nav item definition
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.FC;
  requiredEntitlement?: EntitlementKey;
  requiredRoles?: StaffRole[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  tenant: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ tenant: tenantSlug, isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { has, requireRole } = useEntitlements();
  const user = useCurrentUser();
  const tenant = useCurrentTenant();
  const logoUrl = useTenantCustomizationStore((s) => s.logoUrl);

  const base = `/${tenantSlug}`;

  const navItems: NavItem[] = [
    { label: "Dashboard", href: `${base}/dashboard`, icon: Icon.Dashboard },
    { label: "Schedule", href: `${base}/schedule`, icon: Icon.Calendar, requiredEntitlement: Entitlement.SCHEDULING },
    { label: "Patients", href: `${base}/patients`, icon: Icon.Patients, requiredEntitlement: Entitlement.PATIENT_DEMOGRAPHICS },
    { label: "Analytics", href: `${base}/analytics`, icon: Icon.Analytics, requiredEntitlement: Entitlement.ADVANCED_ANALYTICS },
    { label: "Optical", href: `${base}/optical`, icon: Icon.Optical },
    { label: "Billing", href: `${base}/billing`, icon: Icon.Billing, requiredRoles: ["doctor", "admin", "owner"] },
  ];

  const bottomItems: NavItem[] = [
    { label: "Admin", href: `${base}/admin`, icon: Icon.Settings, requiredRoles: ["admin", "owner"] },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const renderNavItem = (item: NavItem, index: number) => {
    const locked = item.requiredEntitlement && !has(item.requiredEntitlement);
    const roleBlocked = item.requiredRoles && !requireRole(...item.requiredRoles);
    if (roleBlocked) return null;

    const active = isActive(item.href);
    const NavIcon = item.icon;

    return (
      <Link
        key={index}
        href={locked ? "#" : item.href}
        className={`nav-item ${active ? "active" : ""} ${locked ? "opacity-50" : ""}`}
        style={{
          justifyContent: isCollapsed ? "center" : undefined,
          padding: isCollapsed ? "10px 0" : undefined,
          gap: isCollapsed ? "0" : undefined,
        }}
        title={locked ? `Upgrade to unlock ${item.label}` : item.label}
      >
        <NavIcon />
        {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!isCollapsed && locked && (
          <span className="text-[var(--text-muted)]">
            <Icon.Lock />
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col z-20"
      style={{
        width: isCollapsed ? "60px" : "var(--sidebar-width)",
        transition: "width 200ms var(--ease-out-expo)",
        overflow: "hidden",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--glass-border)",
      }}
    >
      {/* Logo / Clinic Name + Collapse Toggle */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: isCollapsed ? "0 16px" : "0 16px",
          justifyContent: isCollapsed ? "center" : undefined,
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Clinic logo"
            className="w-8 h-8 rounded-lg object-contain flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--accent-dim)] border border-[var(--mono-border)]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="var(--accent)" strokeWidth="1.4" />
              <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate text-[var(--text-primary)]">
                {tenant?.clinicName ?? "Loading…"}
              </div>
              <div className="text-overline text-[var(--accent)]">
                {tenant?.planName} Plan
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              title="Collapse sidebar"
              className="flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </>
        )}

        {isCollapsed && (
          <button
            onClick={onToggle}
            className="absolute inset-0 w-full"
            style={{ height: "var(--header-height)", cursor: "pointer", background: "transparent", border: "none" }}
            title="Expand sidebar"
          />
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(renderNavItem)}
      </nav>

      {/* Divider */}
      <div className="px-3">
        <div className="divider" />
      </div>

      {/* Bottom Nav */}
      <nav className="px-3 pb-2 space-y-1">
        {bottomItems.map((item, i) => renderNavItem(item, navItems.length + i))}
      </nav>

      {/* User Footer */}
      <div
        className="flex items-center gap-3"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: isCollapsed ? "12px 0" : "12px 16px",
          justifyContent: isCollapsed ? "center" : undefined,
        }}
      >
        {(() => {
          const roleKey = user?.role ?? "doctor";
          const colors = ROLE_COLORS[roleKey] ?? ROLE_COLORS.doctor;
          return (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono border"
              style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
            >
              {user?.avatarInitials ?? "?"}
            </div>
          );
        })()}
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate text-[var(--text-primary)]">
              {user?.fullName ?? "—"}
            </div>
            <div className="text-[11px] truncate capitalize text-[var(--text-secondary)]">
              {user?.role === "owner" && user.clinicalRole
                ? `Owner · ${user.clinicalRole}`
                : user?.role}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
