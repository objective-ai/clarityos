"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sun, Moon, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useThemeStore, nextTheme } from "@/store/themeStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import type { PatientHeaderData } from "@/types/session";
import type { PatientInsurance } from "@/types/billing";
import { formatClinicDate } from "@/lib/timezone";

const ELIG_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  inactive: "bg-red-400",
  pending_verification: "bg-yellow-400",
  expired: "bg-orange-400",
  unknown: "bg-gray-400",
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


export function TopNav({ patient }: TopNavProps) {
  const pathname = usePathname();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const subtitle = usePageHeaderStore((s) => s.subtitle);
  const pageTitle = getPageTitle(pathname);

  // Fetch insurance for header display
  const [insurance, setInsurance] = useState<PatientInsurance[]>([]);
  useEffect(() => {
    if (!patient?.id) { setInsurance([]); return; }
    fetch(`/api/patients/${patient.id}/insurance`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setInsurance)
      .catch(() => setInsurance([]));
  }, [patient?.id]);
  const activeInsurance = insurance.filter((i: PatientInsurance) => i.is_active);
  const primaryIns = activeInsurance.find((i: PatientInsurance) => i.priority === "primary");
  const secondaryIns = activeInsurance.find((i: PatientInsurance) => i.priority === "secondary");

  // Extract encounterId from pathname for diagnosis tags + provider info
  const encounterId = pathname.includes("/encounter/")
    ? pathname.split("/encounter/")[1]?.split("/")[0] ?? null
    : null;
  const diagnoses = useDiagnosisStore(
    (s) => (encounterId ? s.encounters[encounterId]?.diagnoses : null) ?? []
  );
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
                  {patient.preferredName && (
                    <span className="font-normal text-[var(--text-secondary)]">
                      {" "}&ldquo;{patient.preferredName}&rdquo;
                    </span>
                  )}
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
                    <span>{formatClinicDate(patient.dob)}</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                  </>
                )}
                <span className="font-mono text-[var(--text-muted)]">#{patient.chartNumber ?? patient.id.slice(0, 8)}</span>
              </div>
            </div>

            {/* Insurance summary chips */}
            {(primaryIns || secondaryIns) && (
              <>
                <div className="w-px self-stretch bg-[var(--border-default)] flex-shrink-0" />
                <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                  <Shield size={12} className="text-[var(--text-muted)]" />
                  {primaryIns && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                      <span className={`w-1.5 h-1.5 rounded-full ${ELIG_DOT[primaryIns.eligibility_status] ?? "bg-gray-400"}`} />
                      <span className="text-[var(--text-secondary)]">
                        {primaryIns.payer_name.length > 12 ? primaryIns.payer_name.split(" ")[0] : primaryIns.payer_name}
                      </span>
                      {primaryIns.copay_amount != null && (
                        <span className="text-[var(--text-muted)]">${primaryIns.copay_amount}</span>
                      )}
                    </span>
                  )}
                  {secondaryIns && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                      <span className={`w-1.5 h-1.5 rounded-full ${ELIG_DOT[secondaryIns.eligibility_status] ?? "bg-gray-400"}`} />
                      <span className="text-[var(--text-muted)]">
                        {secondaryIns.payer_name.length > 12 ? secondaryIns.payer_name.split(" ")[0] : secondaryIns.payer_name}
                      </span>
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Diagnosis pills — vertically centered, spanning both rows */}
            {diagnoses.length > 0 && (
              <>
                <div className="w-px self-stretch bg-[var(--border-default)] flex-shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  {diagnoses.map((dx) => {
                    const isOD = dx.eyeAffected === "OD";
                    const isOS = dx.eyeAffected === "OS";
                    return (
                      <span
                        key={dx.id}
                        className="inline-flex items-center gap-0 flex-shrink-0 rounded-full overflow-hidden text-xs"
                        title={dx.description}
                        style={{
                          border: isOD
                            ? "1px solid #93C5FD"
                            : isOS
                            ? "1px solid #C4B5FD"
                            : "1px solid #5EEAD4",
                        }}
                      >
                        <span
                          className="font-mono px-2.5 py-1"
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
                          }}
                        >
                          {dx.icd10Code}
                        </span>
                        {dx.eyeAffected && (
                          <span
                            className="font-mono px-2 py-1"
                            style={{
                              color: isOD
                                ? "#1E40AF"
                                : isOS
                                ? "#5B21B6"
                                : "#115E59",
                            }}
                          >
                            {dx.eyeAffected}
                          </span>
                        )}
                      </span>
                    );
                  })}
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
