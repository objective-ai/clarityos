"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Sun, Moon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useThemeStore, nextTheme } from "@/store/themeStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useCurrentUser, useSessionStore } from "@/store/sessionStore";
import type { PatientHeaderData, StaffRole } from "@/types/session";

const ROLE_COLORS: Record<StaffRole, { bg: string; text: string; border: string }> = {
  doctor:       { bg: "rgba(45,212,191,0.12)",  text: "#2DD4BF", border: "rgba(45,212,191,0.3)"  },
  technician:   { bg: "rgba(96,165,250,0.12)",  text: "#60A5FA", border: "rgba(96,165,250,0.3)"  },
  receptionist: { bg: "rgba(167,139,250,0.12)", text: "#A78BFA", border: "rgba(167,139,250,0.3)" },
  admin:        { bg: "rgba(251,191,36,0.12)",  text: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  owner:        { bg: "rgba(251,113,133,0.12)", text: "#FB7185", border: "rgba(251,113,133,0.3)" },
};

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatSex(sex: PatientHeaderData["sex"]): string {
  return { male: "M", female: "F", other: "O", prefer_not_to_say: "—" }[sex];
}

interface TopNavProps {
  tenantId: string;
  patient?: PatientHeaderData | null;
}

function getPageTitle(pathname: string): string {
  if (pathname.includes("/encounter/")) return "Encounter";
  if (pathname.includes("/schedule")) return "Schedule";
  if (pathname.includes("/patients")) return "Patients";
  if (pathname.includes("/analytics")) return "Analytics";
  if (pathname.includes("/admin")) return "Admin";
  return "Dashboard";
}

type DevScenario = "premium_doctor" | "core_plan" | "technician" | "receptionist" | "owner";

const SCENARIO_LABELS: [DevScenario, string][] = [
  ["premium_doctor", "Doctor (Premium)"],
  ["core_plan", "Doctor (Core Plan)"],
  ["technician", "Technician"],
  ["receptionist", "Receptionist"],
  ["owner", "Owner"],
];

export function TopNav({ tenantId, patient }: TopNavProps) {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { requireRole, has, planName, role } = useEntitlements();
  const isDev = process.env.NODE_ENV === "development";
  const canAccessSettings = requireRole("admin", "owner");
  const setSession = useSessionStore((s) => s.setSession);
  const [activeScenario, setActiveScenario] = useState<DevScenario>("premium_doctor");
  const user = useCurrentUser();
  const pageTitle = getPageTitle(pathname);

  const switchRole = async (scenario: DevScenario) => {
    setActiveScenario(scenario);
    const { getMockSession } = await import("@/lib/auth/mock-session");
    setSession(getMockSession(scenario));
  };

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
      <div className="flex items-center gap-3 min-w-0">
        {patient ? (
          <>
            <h1 className="text-sm font-semibold truncate text-[var(--text-primary)]">
              {patient.lastName}, {patient.firstName}
            </h1>
            <span className="text-[11px] text-[var(--text-secondary)] flex-shrink-0">
              {formatSex(patient.sex)} &middot; {calculateAge(patient.dob)}y &middot;{" "}
              {new Date(patient.dob + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            {patient.alerts.filter((a) => a.severity === "critical").map((a) => (
              <Badge key={a.id} variant="destructive" className="gap-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot bg-current" />
                {a.label}
              </Badge>
            ))}
            {patient.alerts.filter((a) => a.severity === "warning").map((a) => (
              <Badge key={a.id} variant="warning" className="flex-shrink-0">{a.label}</Badge>
            ))}
          </>
        ) : (
          <h1 className="text-heading">{pageTitle}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isDev && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs glass-card cursor-pointer border-none bg-transparent">
                <span className="w-2 h-2 rounded-full flex-shrink-0 animate-glow bg-[var(--accent)]" />
                <span className="text-[var(--text-muted)]">
                  Dev mode &middot;{" "}
                  <span className="text-[var(--accent)] font-mono">{planName}</span>
                  {" "}&middot; role:{" "}
                  <span className="text-[var(--accent)] font-mono">{role}</span>
                  {" "}&middot;{" "}
                  <span className="font-mono">ai_scribe: {String(has(Entitlement.AI_SCRIBE))}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SCENARIO_LABELS.map(([scenario, label]) => (
                <DropdownMenuItem
                  key={scenario}
                  onClick={() => switchRole(scenario)}
                  className="flex items-center justify-between gap-3"
                >
                  <span>{label}</span>
                  {activeScenario === scenario && (
                    <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(nextTheme(theme))}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Link href={`/${tenantId}/admin`}>
          <Button variant="ghost" size="icon" aria-label="Admin">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>

        {!patient && (() => {
          const roleKey = user?.role ?? "doctor";
          const colors = ROLE_COLORS[roleKey] ?? ROLE_COLORS.doctor;
          return (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono border ml-1"
              style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
            >
              {user?.avatarInitials ?? "?"}
            </div>
          );
        })()}
      </div>
    </header>
  );
}
