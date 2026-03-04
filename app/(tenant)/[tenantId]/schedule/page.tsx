"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { Badge } from "@/components/ui/badge";

const MOCK_APPOINTMENTS = [
  { id: "apt-001", time: "8:00 AM", patient: "James Wilson", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-002", time: "9:00 AM", patient: "Lisa Park", type: "Contact Lens Follow-up", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-003", time: "9:30 AM", patient: "David Brown", type: "Glaucoma Check", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-004", time: "10:15 AM", patient: "Emily Davis", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-005", time: "11:00 AM", patient: "Robert Kim", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-006", time: "11:30 AM", patient: "Anna Lopez", type: "Dry Eye Evaluation", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-007", time: "1:15 PM", patient: "Margaret Chen", type: "Comprehensive Eye Exam", status: "in_progress", provider: "Dr. Morgan" },
  { id: "apt-008", time: "2:30 PM", patient: "Robert Kim", type: "Retinal Photo Review", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-009", time: "3:00 PM", patient: "Sarah Johnson", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-010", time: "3:45 PM", patient: "Michael Torres", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-011", time: "4:30 PM", patient: "Karen White", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },
];

const STATUS_VARIANT: Record<string, "success" | "warning" | "info"> = {
  completed: "success",
  in_progress: "warning",
  scheduled: "info",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  scheduled: "Scheduled",
};

const STATUS_COLOR: Record<string, string> = {
  completed: "var(--state-normal)",
  in_progress: "var(--state-warning)",
  scheduled: "var(--state-info)",
};

export default function SchedulePage() {
  const { has } = useEntitlements();
  const { tenantId } = useParams<{ tenantId: string }>();

  if (!has(Entitlement.SCHEDULING)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Scheduling Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Upgrade your plan to access the appointment calendar.
          </p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-2xl">Schedule</h1>
          <p className="text-body mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="default">{MOCK_APPOINTMENTS.length} appointments</Badge>
          <Badge variant="success">
            {MOCK_APPOINTMENTS.filter((a) => a.status === "completed").length} completed
          </Badge>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex flex-col gap-3">
        {MOCK_APPOINTMENTS.map((apt) => (
          <Link
            key={apt.id}
            href={`/${tenantId}/encounter/${apt.id}`}
            className={`glass-card glass-card-hover flex items-center gap-5 px-5 py-4 no-underline ${
              apt.status === "completed" ? "opacity-60" : ""
            }`}
            style={{
              borderLeft: `3px solid ${STATUS_COLOR[apt.status]}`,
            }}
          >
            {/* Time */}
            <span className="text-lg font-mono font-semibold w-20 flex-shrink-0 text-right text-[var(--text-primary)]">
              {apt.time}
            </span>

            {/* Status dot */}
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                apt.status === "in_progress" ? "animate-glow" : ""
              }`}
              style={{ background: STATUS_COLOR[apt.status] }}
            />

            {/* Patient info */}
            <div className="flex-1 min-w-0">
              <span className="text-subhead">{apt.patient}</span>
              <span className="text-caption ml-3 text-[var(--text-muted)]">{apt.type}</span>
            </div>

            {/* Status badge */}
            <Badge variant={STATUS_VARIANT[apt.status]}>
              {STATUS_LABEL[apt.status]}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
