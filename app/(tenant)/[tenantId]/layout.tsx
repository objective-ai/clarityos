"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { PatientStickyHeader } from "@/components/PatientStickyHeader";
import { useEncounterStore } from "@/store/encounterStore";
import { getPatientById, getPatientIdForEncounter } from "@/lib/mock-patient-data";
import { getPatientIdForAppointment } from "@/lib/mock-schedule-data";
import type { PatientHeaderData } from "@/types/session";

export default function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenantId: string };
}) {
  const pathname = usePathname();
  const isEncounterRoute = /\/encounter\//.test(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Derive patient for sticky header from encounter store
  const encounterId = isEncounterRoute
    ? pathname.split("/encounter/")[1]?.split("/")[0]
    : null;
  const encounters = useEncounterStore((s) => s.encounters);
  const patientHeader = useMemo<PatientHeaderData | null>(() => {
    if (!encounterId) return null;
    const enc = encounters[encounterId];
    const patientId =
      enc?.patientId ??
      getPatientIdForEncounter(encounterId) ??
      getPatientIdForAppointment(encounterId);
    if (!patientId) return null;
    const patient = getPatientById(patientId);
    if (!patient) return null;
    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      preferredName: patient.preferredName ?? null,
      dob: patient.dob,
      sex: patient.sex === "F" ? "female" : "male",
      alerts: patient.alerts,
    };
  }, [encounterId, encounters]);

  // Auto-collapse sidebar on tablet-sized screens
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(!e.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen ambient-bg">
      <Sidebar
        tenantId={params.tenantId}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div
        className="relative z-10"
        style={{
          paddingLeft: sidebarCollapsed ? "60px" : "var(--sidebar-width)",
          transition: "padding-left 200ms var(--ease-out-expo)",
        }}
      >
        <TopNav tenantId={params.tenantId} patient={isEncounterRoute ? patientHeader : null} />

        {!isEncounterRoute && patientHeader && (
          <PatientStickyHeader patient={patientHeader} />
        )}

        <main className="p-6 lg:p-8">
          <SidebarProvider value={sidebarCollapsed}>
            {children}
          </SidebarProvider>
        </main>
      </div>
    </div>
  );
}
