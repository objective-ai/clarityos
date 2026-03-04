"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { PatientStickyHeader } from "@/components/PatientStickyHeader";
import type { PatientHeaderData } from "@/types/session";

const MOCK_PATIENT: PatientHeaderData = {
  id: "pat-001",
  firstName: "Margaret",
  lastName: "Chen",
  preferredName: "Maggie",
  dob: "1958-03-12",
  sex: "female",
  alerts: [
    { id: "a1", severity: "critical", label: "Sulfa allergy" },
    { id: "a2", severity: "warning", label: "Glaucoma suspect" },
    { id: "a3", severity: "info", label: "Diabetic" },
  ],
};

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

  // Auto-collapse sidebar on tablet-sized screens
  useEffect(() => {
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
        <TopNav tenantId={params.tenantId} />

        {isEncounterRoute && (
          <PatientStickyHeader patient={MOCK_PATIENT} />
        )}

        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
