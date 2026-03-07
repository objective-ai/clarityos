"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SessionTimeoutModal } from "@/components/auth/SessionTimeoutModal";
import { useEncounterStore } from "@/store/encounterStore";
import type { PatientHeaderData } from "@/types/session";

export default function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const pathname = usePathname();
  const isEncounterRoute = /\/encounter\//.test(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Derive patient for sticky header from encounter store
  const encounterId = isEncounterRoute
    ? pathname.split("/encounter/")[1]?.split("/")[0]
    : null;
  const encounters = useEncounterStore((s) => s.encounters);
  // Build patient header from encounterStore demographics (loaded via loadEncounter API)
  const patientHeader = useMemo<PatientHeaderData | null>(() => {
    if (!encounterId) return null;
    const enc = encounters[encounterId];
    const patientId = enc?.patientId;
    if (!patientId || !enc.patientName) return null;
    // Split "Last, First" or "First Last" into parts
    const nameParts = enc.patientName.includes(",")
      ? enc.patientName.split(",").map((s) => s.trim())
      : enc.patientName.split(" ");
    const lastName = nameParts[0] ?? "";
    const firstName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    return {
      id: patientId,
      chartNumber: enc.patientChartNumber,
      firstName: firstName || lastName,
      lastName: lastName,
      preferredName: enc.patientPreferredName ?? null,
      dob: enc.patientDob ?? "",
      sex: (enc.patientSex as PatientHeaderData["sex"]) ?? "prefer_not_to_say",
      alerts: [],
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
    <AuthProvider>
      <div className="min-h-screen ambient-bg">
        <SessionTimeoutModal />

        <Sidebar
          tenant={params.tenant}
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
          <TopNav tenant={params.tenant} patient={isEncounterRoute ? patientHeader : null} />

          <main className="p-6 lg:p-8">
            <SidebarProvider value={sidebarCollapsed}>
              {children}
            </SidebarProvider>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
