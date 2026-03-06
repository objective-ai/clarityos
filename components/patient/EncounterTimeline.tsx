"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePatientStore } from "@/store/patientStore";
import type { PatientEncounterSummary } from "@/types/patient";

// ---------------------------------------------------------------------------
// Timeline item
// ---------------------------------------------------------------------------

function TimelineItem({ encounter }: { encounter: PatientEncounterSummary }) {
  const dateStr = new Date(encounter.encounterDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="relative pl-8 pb-6 last:pb-0 group">
      {/* Timeline line */}
      <div className="absolute left-3 top-3 bottom-0 w-px bg-[var(--border-subtle)] group-last:hidden" />

      {/* Timeline dot */}
      <div
        className={`absolute left-1.5 top-2.5 w-3 h-3 rounded-full border-2 ${
          encounter.isFinalized
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "bg-[var(--bg-surface)] border-[var(--text-muted)]"
        }`}
      />

      <Card className="glass-card-hover transition-all duration-200">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-body font-medium text-[var(--text-primary)]">
                {dateStr}
              </span>
              <Badge variant={encounter.isFinalized ? "default" : "secondary"}>
                {encounter.isFinalized ? "Finalized" : "In Progress"}
              </Badge>
              {encounter.diagnosisCount > 0 && (
                <Badge variant="outline">
                  {encounter.diagnosisCount} Dx
                </Badge>
              )}
            </div>
          </div>

          {encounter.providerName && (
            <p className="text-caption text-[var(--text-secondary)] mb-1">
              Provider: {encounter.providerName}
            </p>
          )}

          {encounter.chiefComplaint && (
            <p className="text-body text-[var(--text-primary)] mb-2">
              <span className="text-[var(--text-muted)]">CC:</span>{" "}
              {encounter.chiefComplaint}
            </p>
          )}

          {encounter.aiSummaryText && (
            <div className="mt-2 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <p className="text-caption text-[var(--text-muted)] uppercase tracking-wider mb-1">
                AI Summary
              </p>
              <p className="text-body text-[var(--text-secondary)] line-clamp-3">
                {encounter.aiSummaryText.substring(0, 300)}
                {encounter.aiSummaryText.length > 300 ? "..." : ""}
              </p>
            </div>
          )}

          {!encounter.aiSummaryText && encounter.assessmentAndPlan && (
            <div className="mt-2 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <p className="text-caption text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Assessment & Plan
              </p>
              <p className="text-body text-[var(--text-secondary)] line-clamp-3">
                {encounter.assessmentAndPlan.substring(0, 300)}
                {encounter.assessmentAndPlan.length > 300 ? "..." : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EncounterTimeline
// ---------------------------------------------------------------------------

interface EncounterTimelineProps {
  patientId: string;
}

export function EncounterTimeline({ patientId }: EncounterTimelineProps) {
  const encounters = usePatientStore((s) => s.encounters);
  const loading = usePatientStore((s) => s.encountersLoading);
  const fetchEncounters = usePatientStore((s) => s.fetchEncounters);

  useEffect(() => {
    fetchEncounters(patientId);
  }, [patientId, fetchEncounters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (encounters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="3" width="14" height="14" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
            <path d="M7 7h6M7 10h4" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-body text-[var(--text-muted)]">No encounters on file</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {encounters.map((enc) => (
        <TimelineItem key={enc.id} encounter={enc} />
      ))}
    </div>
  );
}
