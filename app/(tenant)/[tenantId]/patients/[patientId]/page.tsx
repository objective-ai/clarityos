"use client";

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Patient Detail Page
// Phase 5 will wire real patient data from the API.
// For now, show appropriate placeholder instead of crashing.
// ---------------------------------------------------------------------------

export default function PatientDetailPage({
  params,
}: {
  params: { tenantId: string; patientId: string };
}) {
  const { has } = useEntitlements();

  if (!has(Entitlement.PATIENT_DEMOGRAPHICS)) {
    const meta = ENTITLEMENT_META.patient_demographics;
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--accent-dim)] border border-[var(--mono-border)]">
              <Lock className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-heading mb-1">{meta.label}</h2>
              <p className="text-body">{meta.description}</p>
            </div>
            <Badge variant="default">{meta.plan} Plan</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Patient data will be loaded from the real API in Phase 5.
  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col gap-3">
        <Link
          href={`/${params.tenantId}/patients`}
          className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Patients
        </Link>
      </div>

      <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="3.5" stroke="var(--text-muted)" strokeWidth="1.4" />
            <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-subhead">Patient {params.patientId}</p>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            Full patient details coming in Phase 5.
          </p>
        </div>
        <Link href={`/${params.tenantId}/patients`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Patients
          </Button>
        </Link>
      </div>
    </div>
  );
}
