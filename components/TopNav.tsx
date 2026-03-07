"use client";

import { usePathname } from "next/navigation";
import { Sun, Moon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useThemeStore, nextTheme } from "@/store/themeStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useSessionStore } from "@/store/sessionStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useEncounterStore } from "@/store/encounterStore";
import type { PatientHeaderData, StaffRole } from "@/types/session";

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
  tenant: string;
  patient?: PatientHeaderData | null;
}

function getPageTitle(pathname: string): string {
  if (pathname.includes("/encounter/")) return "Encounter";
  if (pathname.includes("/schedule")) return "Schedule";
  if (pathname.includes("/patients")) return "Patients";
  if (pathname.includes("/analytics")) return "Analytics";
  if (pathname.includes("/admin")) return "Admin";
  if (pathname.includes("/optical")) return "Optical";
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

export function TopNav({ tenant, patient }: TopNavProps) {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const subtitle = usePageHeaderStore((s) => s.subtitle);
  const { has, planName, role } = useEntitlements();
  const isDev = process.env.NODE_ENV === "development";
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const pageTitle = getPageTitle(pathname);

  // Extract encounterId from pathname for diagnosis tags + provider info
  const encounterId = pathname.includes("/encounter/")
    ? pathname.split("/encounter/")[1]?.split("/")[0] ?? null
    : null;
  const diagnoses = useDiagnosisStore(
    (s) => (encounterId ? s.encounters[encounterId]?.diagnoses : null) ?? []
  );
  const encounter = useEncounterStore(
    (s) => (encounterId ? s.encounters[encounterId] : null) ?? null
  );

  // Derive active scenario from actual session state so badge and checkmark stay in sync
  const activeScenario: DevScenario = (() => {
    if (role === "receptionist") return "receptionist";
    if (role === "technician") return "technician";
    if (role === "owner") return "owner";
    if (planName === "Core") return "core_plan";
    return "premium_doctor";
  })();

  const switchRole = async (scenario: DevScenario) => {
    const { switchDevRole, getMockSession } = await import(
      "@/lib/auth/mock-session"
    );
    if (session) {
      setSession(switchDevRole(session, scenario));
    } else {
      setSession(getMockSession(scenario));
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6"
      style={{
        minHeight: "var(--header-height)",
        background: "var(--bg-sticky-header)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--glass-border)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {patient ? (
          <div className="flex items-center gap-3 min-w-0">
            {/* Name + Demographics block */}
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold truncate text-[var(--text-primary)]">
                  {patient.lastName}, {patient.firstName}
                </h1>
                {patient.alerts.filter((a) => a.severity === "critical").map((a) => (
                  <Badge key={a.id} variant="destructive" className="gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot bg-current" />
                    {a.label}
                  </Badge>
                ))}
                {patient.alerts.filter((a) => a.severity === "warning").map((a) => (
                  <Badge key={a.id} variant="warning" className="flex-shrink-0">{a.label}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mt-0.5">
                {patient.dob && (
                  <>
                    <span>{formatSex(patient.sex)}</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                    <span>{calculateAge(patient.dob)}y</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                    <span>{new Date(patient.dob + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                  </>
                )}
                <span className="font-mono text-[var(--text-muted)]">#{patient.chartNumber ?? patient.id.slice(0, 8)}</span>
              </div>
            </div>

            {/* Diagnosis pills — vertically centered, spanning both rows */}
            {diagnoses.length > 0 && (
              <>
                <div className="w-px self-stretch bg-[var(--border-default)] flex-shrink-0" />
                <div className="flex items-center gap-2 flex-shrink-0">
                  {diagnoses.slice(0, 4).map((dx) => {
                    const isOD = dx.eyeAffected === "OD";
                    const isOS = dx.eyeAffected === "OS";
                    return (
                      <span
                        key={dx.id}
                        className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-xl text-base px-4 py-2.5 font-semibold max-w-[200px]"
                        title={dx.icd10Code}
                        style={{
                          background: isOD
                            ? "#DBEAFE"
                            : isOS
                            ? "#EDE9FE"
                            : "#CCFBF1",
                          color: isOD
                            ? "#1E40AF"
                            : isOS
                            ? "#5B21B6"
                            : "#115E59",
                          border: isOD
                            ? "1px solid #93C5FD"
                            : isOS
                            ? "1px solid #C4B5FD"
                            : "1px solid #5EEAD4",
                        }}
                      >
                        <span className="truncate">{dx.description || dx.icd10Code}</span>
                        {dx.eyeAffected && (
                          <span className="font-bold flex-shrink-0">{dx.eyeAffected}</span>
                        )}
                      </span>
                    );
                  })}
                  {diagnoses.length > 4 && (
                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                      +{diagnoses.length - 4}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-heading whitespace-nowrap">{pageTitle}</h1>
            {subtitle && (
              <>
                <span className="text-[var(--text-muted)]">&middot;</span>
                <span className="text-body text-sm truncate">{subtitle}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
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

        <LogoutButton
          collapsed
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        />
      </div>
    </header>
  );
}
