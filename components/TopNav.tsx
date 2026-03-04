"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore, nextTheme } from "@/store/themeStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useCurrentUser } from "@/store/sessionStore";

interface TopNavProps {
  tenantId: string;
}

function getPageTitle(pathname: string): string {
  if (pathname.includes("/encounter/")) return "Encounter";
  if (pathname.includes("/schedule")) return "Schedule";
  if (pathname.includes("/patients")) return "Patients";
  if (pathname.includes("/analytics")) return "Analytics";
  if (pathname.includes("/settings")) return "Settings";
  return "Dashboard";
}

export function TopNav({ tenantId }: TopNavProps) {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { requireRole, has, planName, role } = useEntitlements();
  const isDev = process.env.NODE_ENV === "development";
  const canAccessSettings = requireRole("admin", "owner");
  const user = useCurrentUser();
  const pageTitle = getPageTitle(pathname);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6"
      style={{
        height: "var(--header-height)",
        background: "var(--bg-sticky-header)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--glass-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-heading">{pageTitle}</h1>
        {canAccessSettings && (
          <Link href={`/${tenantId}/settings`}>
            <Button variant="ghost" size="icon" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isDev && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs glass-card">
            <span className="w-2 h-2 rounded-full flex-shrink-0 animate-glow bg-[var(--accent)]" />
            <span className="text-[var(--text-muted)]">
              Dev mode &middot;{" "}
              <span className="text-[var(--accent)] font-mono">{planName}</span>
              {" "}&middot; role:{" "}
              <span className="text-[var(--accent)] font-mono">{role}</span>
              {" "}&middot;{" "}
              <span className="font-mono">ai_scribe: {String(has(Entitlement.AI_SCRIBE))}</span>
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(nextTheme(theme))}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] font-mono ml-1">
          {user?.avatarInitials ?? "?"}
        </div>
      </div>
    </header>
  );
}
