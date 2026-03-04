"use client";

import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, Shield, Heart, Lock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import { getPatientById, getPatientEncounters } from "@/lib/mock-patient-data";

const STATUS_VARIANT: Record<string, "success" | "warning" | "info"> = {
  finalized: "success",
  in_exam: "warning",
  pre_test: "info",
};

const STATUS_LABEL: Record<string, string> = {
  finalized: "Finalized",
  in_exam: "In Exam",
  pre_test: "Pre-Test",
};

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PatientDetailPage({
  params,
}: {
  params: { tenantId: string; patientId: string };
}) {
  const { has } = useEntitlements();
  const patient = getPatientById(params.patientId);
  const encounters = getPatientEncounters(params.patientId);

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

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-heading">Patient Not Found</h1>
        <p className="text-body">No patient with ID &quot;{params.patientId}&quot;</p>
        <Link href={`/${params.tenantId}/patients`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Patients
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Back + Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={`/${params.tenantId}/patients`}
          className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Patients
        </Link>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] font-mono">
            {patient.firstName[0]}{patient.lastName[0]}
          </div>
          <div>
            <h1 className="text-display text-2xl">
              {patient.firstName} {patient.lastName}
              {patient.preferredName && (
                <span className="text-[var(--text-muted)] font-normal text-lg ml-2">
                  &quot;{patient.preferredName}&quot;
                </span>
              )}
            </h1>
            <p className="text-body font-mono">
              {formatDate(patient.dob)} &middot; {calculateAge(patient.dob)}y &middot; {patient.sex}
              <span className="text-[var(--text-muted)] ml-3">{patient.id}</span>
            </p>
          </div>
        </div>

        {/* Alerts */}
        {patient.alerts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {patient.alerts.map((alert) => (
              <Badge
                key={alert.id}
                variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "warning" : "info"}
              >
                {alert.label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Demographics */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                <span className="text-sm text-[var(--text-primary)]">{patient.phone}</span>
              </div>
              {patient.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-primary)]">{patient.email}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[var(--text-primary)]">{patient.address}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {patient.insurance && (
            <Card>
              <CardHeader>
                <CardTitle>Insurance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{patient.insurance.provider}</span>
                </div>
                <div className="flex flex-col gap-1 pl-7">
                  <span className="text-caption text-[var(--text-secondary)]">
                    Member: <span className="font-mono">{patient.insurance.memberId}</span>
                  </span>
                  {patient.insurance.group && (
                    <span className="text-caption text-[var(--text-secondary)]">
                      Group: <span className="font-mono">{patient.insurance.group}</span>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {patient.emergencyContact && (
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Heart className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{patient.emergencyContact.name}</span>
                  <Badge variant="secondary">{patient.emergencyContact.relation}</Badge>
                </div>
                <span className="text-caption text-[var(--text-secondary)] pl-7">{patient.emergencyContact.phone}</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — Encounters + Rx */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Past Encounters */}
          <Card>
            <CardHeader>
              <CardTitle>Encounters ({encounters.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {encounters.length === 0 ? (
                <div className="px-5 py-10 text-center text-caption text-[var(--text-muted)]">
                  No encounters on record.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {encounters.map((enc) => (
                    <Link
                      key={enc.id}
                      href={`/${params.tenantId}/encounter/${enc.id}`}
                      className="flex flex-col gap-2 px-5 py-4 hover-row transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{formatDate(enc.date)}</span>
                          <Badge variant={STATUS_VARIANT[enc.status] ?? "secondary"}>
                            {STATUS_LABEL[enc.status] ?? enc.status}
                          </Badge>
                        </div>
                        <span className="text-caption text-[var(--text-secondary)]">{enc.provider}</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">{enc.chiefComplaint}</p>
                      {enc.diagnoses.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {enc.diagnoses.map((dx) => (
                            <span
                              key={dx}
                              className="text-xs font-mono px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)]"
                            >
                              {dx}
                            </span>
                          ))}
                        </div>
                      )}
                      {enc.finalRx && (
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-[var(--text-muted)]">Rx:</span>
                          <span className="text-xs font-mono text-[var(--text-primary)]">OD {enc.finalRx.od}</span>
                          <span className="text-xs font-mono text-[var(--text-primary)]">OS {enc.finalRx.os}</span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rx History Comparison */}
          {encounters.filter((e) => e.finalRx).length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Rx History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)]">
                      {["Date", "OD Rx", "OS Rx"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-overline">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {encounters
                      .filter((e) => e.finalRx)
                      .map((enc) => (
                        <tr key={enc.id} className="border-t border-[var(--border-subtle)]">
                          <td className="px-5 py-3 text-[var(--text-secondary)]">{formatDate(enc.date)}</td>
                          <td className="px-5 py-3 font-mono text-[var(--text-primary)]">{enc.finalRx!.od}</td>
                          <td className="px-5 py-3 font-mono text-[var(--text-primary)]">{enc.finalRx!.os}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
