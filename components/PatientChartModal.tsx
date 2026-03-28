"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { usePatientStore } from "@/store/patientStore";
import type { PatientEncounterSummary } from "@/types/patient";
import { formatClinicDate } from "@/lib/timezone";
import { ProblemListCard } from "@/components/patient/ProblemListCard";
import { EncounterTimeline } from "@/components/patient/EncounterTimeline";
import { RxHistoryTable } from "@/components/patient/RxHistoryTable";
import { ClinicalFlowsheet } from "@/components/patient/ClinicalFlowsheet";
import { InsuranceTab } from "@/components/patient/InsuranceTab";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type ChartTab = "summary" | "encounters" | "rx-history" | "flowsheets" | "insurance";

const TABS: { key: ChartTab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "encounters", label: "Encounters" },
  { key: "rx-history", label: "Rx History" },
  { key: "flowsheets", label: "Flowsheets" },
  { key: "insurance", label: "Insurance" },
];

// ---------------------------------------------------------------------------
// Latest Encounter Card (Summary tab)
// ---------------------------------------------------------------------------

function LatestEncounterCard({ encounter }: { encounter: PatientEncounterSummary }) {
  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-subhead">Latest Encounter</h4>
        <Badge variant={encounter.isFinalized ? "default" : "outline"}>
          {encounter.isFinalized ? "Finalized" : "In Progress"}
        </Badge>
      </div>
      <div className="flex items-center gap-3 text-body text-[var(--text-secondary)]">
        <span>{formatClinicDate(encounter.encounterDate)}</span>
        {encounter.providerName && (
          <>
            <span className="text-[var(--text-muted)]">|</span>
            <span>{encounter.providerName}</span>
          </>
        )}
      </div>
      {encounter.chiefComplaint && (
        <p className="text-body text-[var(--text-secondary)]">
          <span className="text-caption text-[var(--text-muted)]">CC: </span>
          {encounter.chiefComplaint}
        </p>
      )}
      {encounter.diagnosisCount > 0 && (
        <p className="text-caption text-[var(--text-muted)]">
          {encounter.diagnosisCount} diagnosis{encounter.diagnosisCount !== 1 ? "es" : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Tab
// ---------------------------------------------------------------------------

function SummaryTab({
  patientId,
  encounters,
  encountersLoading,
}: {
  patientId: string;
  encounters: PatientEncounterSummary[];
  encountersLoading: boolean;
}) {
  const latest = encounters[0] ?? null;

  return (
    <div className="space-y-4">
      <ProblemListCard patientId={patientId} />
      {encountersLoading ? (
        <div className="animate-pulse h-24 bg-white/5 rounded-xl" />
      ) : latest ? (
        <LatestEncounterCard encounter={latest} />
      ) : (
        <p className="text-body text-[var(--text-muted)] text-center py-6">
          No previous encounters
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sexLabel(sex: string): string {
  switch (sex) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "other":
      return "Other";
    default:
      return sex;
  }
}

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

// ---------------------------------------------------------------------------
// PatientChartModal
// ---------------------------------------------------------------------------

interface PatientChartModalProps {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientChartModal({
  patientId,
  open,
  onOpenChange,
}: PatientChartModalProps) {
  const { tenant } = useParams<{ tenant: string }>();
  const [activeTab, setActiveTab] = useState<ChartTab>("summary");

  const patient = usePatientStore((s) => s.activePatient);
  const loading = usePatientStore((s) => s.detailLoading);
  const encounters = usePatientStore((s) => s.encounters);
  const encountersLoading = usePatientStore((s) => s.encountersLoading);
  const fetchPatient = usePatientStore((s) => s.fetchPatient);
  const fetchEncounters = usePatientStore((s) => s.fetchEncounters);

  // Fetch patient data if not already loaded for this patientId
  useEffect(() => {
    if (!open || !patientId) return;
    if (!patient || patient.id !== patientId) {
      fetchPatient(patientId);
    }
    fetchEncounters(patientId);
  }, [open, patientId, patient, fetchPatient, fetchEncounters]);

  // Reset to Summary tab when modal opens
  useEffect(() => {
    if (open) setActiveTab("summary");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        {/* No patient selected */}
        {!patientId ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-body text-[var(--text-muted)]">
              No patient selected
            </p>
          </div>
        ) : loading ? (
          /* Loading state */
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : patient ? (
          <>
            {/* Header */}
            <DialogHeader className="px-6 pt-5 pb-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center text-sm font-semibold text-[var(--accent)]">
                  {patient.firstName[0]}
                  {patient.lastName[0]}
                </div>
                <div>
                  <DialogTitle className="text-lg">
                    {patient.lastName}, {patient.firstName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline">#{patient.chartNumber}</Badge>
                    <span className="text-caption text-[var(--text-secondary)]">
                      {formatClinicDate(patient.dob)} ({calculateAge(patient.dob)} y/o)
                    </span>
                    <Badge variant="outline">{sexLabel(patient.sex)}</Badge>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Tab bar */}
            <div className="flex items-center gap-1 px-6 pt-4 border-b border-[var(--border-subtle)]">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.key
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === "summary" && (
                <SummaryTab
                  patientId={patientId}
                  encounters={encounters}
                  encountersLoading={encountersLoading}
                />
              )}
              {activeTab === "encounters" && (
                <EncounterTimeline patientId={patientId} />
              )}
              {activeTab === "rx-history" && (
                <RxHistoryTable patientId={patientId} />
              )}
              {activeTab === "flowsheets" && (
                <ClinicalFlowsheet patientId={patientId} />
              )}
              {activeTab === "insurance" && (
                <InsuranceTab patientId={patientId} />
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex justify-end">
              <Link
                href={`/${tenant}/patients/${patientId}`}
                onClick={() => onOpenChange(false)}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                Open full record &rarr;
              </Link>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
