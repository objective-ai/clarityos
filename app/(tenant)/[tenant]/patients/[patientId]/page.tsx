"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import { usePatientStore } from "@/store/patientStore";
import { EncounterTimeline } from "@/components/patient/EncounterTimeline";
import { ClinicalFlowsheet } from "@/components/patient/ClinicalFlowsheet";
import { PrepMeButton } from "@/components/patient/PrepMeButton";
import type { PatientDetail } from "@/types/patient";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabKey = "demographics" | "encounters" | "flowsheets";

const TABS: { key: TabKey; label: string }[] = [
  { key: "demographics", label: "Demographics" },
  { key: "encounters", label: "Encounters" },
  { key: "flowsheets", label: "Flowsheets" },
];

// ---------------------------------------------------------------------------
// Demographics tab
// ---------------------------------------------------------------------------

function DemographicsTab({ patient }: { patient: PatientDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Contact Info */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-subhead mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="3" stroke="var(--text-muted)" strokeWidth="1.2" />
              <path d="M2 14c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Contact Information
          </h3>
          <div className="space-y-3">
            <InfoRow label="Phone" value={patient.phone} />
            <InfoRow label="Email" value={patient.email} />
            <InfoRow
              label="Address"
              value={formatAddress(patient)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Insurance */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-subhead mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.2" />
              <path d="M2 7h12" stroke="var(--text-muted)" strokeWidth="1.2" />
            </svg>
            Insurance
          </h3>
          <div className="space-y-3">
            <InfoRow label="Provider" value={patient.insuranceProvider} />
            <InfoRow label="Member ID" value={patient.insuranceMemberId} />
            <InfoRow label="Group" value={patient.insuranceGroup} />
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <h3 className="text-subhead mb-4 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M2 8h12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Emergency Contact
          </h3>
          <div className="space-y-3">
            <InfoRow label="Name" value={patient.emergencyContactName} />
            <InfoRow label="Phone" value={patient.emergencyContactPhone} />
            <InfoRow label="Relation" value={patient.emergencyContactRelation} />
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {patient.notes && (
        <Card className="glass-card">
          <CardContent className="p-5">
            <h3 className="text-subhead mb-4">Notes</h3>
            <p className="text-body text-[var(--text-secondary)] whitespace-pre-wrap">
              {patient.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-caption text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="text-body text-[var(--text-primary)] text-right">
        {value || "--"}
      </span>
    </div>
  );
}

function formatAddress(patient: PatientDetail): string | null {
  const parts = [
    patient.addressLine1,
    patient.addressLine2,
    [patient.city, patient.state].filter(Boolean).join(", "),
    patient.zipCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// ---------------------------------------------------------------------------
// Patient Detail Page
// ---------------------------------------------------------------------------

export default function PatientDetailPage() {
  const { tenant, patientId } = useParams<{
    tenant: string;
    patientId: string;
  }>();
  const { has } = useEntitlements();
  const [activeTab, setActiveTab] = useState<TabKey>("demographics");

  const patient = usePatientStore((s) => s.activePatient);
  const loading = usePatientStore((s) => s.detailLoading);
  const error = usePatientStore((s) => s.detailError);
  const fetchPatient = usePatientStore((s) => s.fetchPatient);
  const clearActivePatient = usePatientStore((s) => s.clearActivePatient);

  useEffect(() => {
    if (patientId) {
      fetchPatient(patientId);
    }
    return () => clearActivePatient();
  }, [patientId, fetchPatient, clearActivePatient]);

  // Entitlement gate
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

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col gap-6 stagger">
        <Link
          href={`/${tenant}/patients`}
          className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Patients
        </Link>
        <div className="glass-card p-8 text-center">
          <p className="text-body text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={() => fetchPatient(patientId)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No patient
  if (!patient) {
    return null;
  }

  const age = calculateAge(patient.dob);
  const dobFormatted = new Date(patient.dob).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function sexLabel(sex: string): string {
    switch (sex) {
      case "male": return "Male";
      case "female": return "Female";
      case "other": return "Other";
      default: return sex;
    }
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Back link */}
      <Link
        href={`/${tenant}/patients`}
        className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All Patients
      </Link>

      {/* Patient header */}
      <Card className="glass-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-heading font-semibold text-[var(--accent)]">
                {patient.firstName[0]}
                {patient.lastName[0]}
              </div>

              <div>
                <h1 className="text-display text-xl">
                  {patient.lastName}, {patient.firstName}
                  {patient.preferredName
                    ? ` "${patient.preferredName}"`
                    : ""}
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-body text-[var(--text-secondary)]">
                    {dobFormatted} ({age} y/o)
                  </span>
                  <Badge variant="outline">{sexLabel(patient.sex)}</Badge>
                  {patient.phone && (
                    <span className="text-body text-[var(--text-secondary)]">
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="text-body text-[var(--text-muted)]">
                      {patient.email}
                    </span>
                  )}
                </div>

                {/* Insurance summary */}
                {patient.insuranceProvider && (
                  <p className="text-caption text-[var(--text-muted)] mt-1">
                    {patient.insuranceProvider}
                    {patient.insuranceMemberId
                      ? ` / ${patient.insuranceMemberId}`
                      : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Prep Me */}
            <PrepMeButton patientId={patientId} />
          </div>

          {/* Alerts */}
          {patient.alerts.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {patient.alerts.map((alert, i) => (
                <Badge
                  key={i}
                  variant={
                    alert.severity === "critical"
                      ? "destructive"
                      : alert.severity === "warning"
                      ? "warning"
                      : "info"
                  }
                >
                  {alert.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-body font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "demographics" && <DemographicsTab patient={patient} />}
        {activeTab === "encounters" && (
          <EncounterTimeline patientId={patientId} />
        )}
        {activeTab === "flowsheets" && (
          <ClinicalFlowsheet patientId={patientId} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
