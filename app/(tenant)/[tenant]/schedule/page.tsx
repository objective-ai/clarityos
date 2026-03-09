"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useAppointmentStore, localDateISO } from "@/store/appointmentStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import type { PatientSummary, PatientListResponse } from "@/types/patient";
import IntakeLinkModal from "@/components/schedule/IntakeLinkModal";
import TimelineView from "@/components/schedule/TimelineView";
import ClinicView from "@/components/schedule/ClinicView";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
} from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_DURATIONS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localDateISO(d);
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase select-none"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Overflow Menu (kebab) — generic item array
// ---------------------------------------------------------------------------

interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  variant?: "danger";
}

function OverflowMenu({ items }: { items: OverflowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        aria-label="More actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="8" cy="13" r="1.25" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)]">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                item.variant === "danger"
                  ? "text-red-500 hover:bg-red-500/10"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment Card
// ---------------------------------------------------------------------------

function AppointmentCard({
  appointment,
  tz,
  onCheckIn,
  onStartExam,
  onCancel,
  onRevertCheckIn,
  onReschedule,
  onFollowUp,
  onViewEncounter,
  onSendIntake,
}: {
  appointment: Appointment;
  tz?: string;
  onCheckIn: (id: string) => void;
  onStartExam: (id: string) => void;
  onCancel: (id: string) => void;
  onRevertCheckIn: (id: string) => void;
  onReschedule: (appt: Appointment) => void;
  onFollowUp: (appt: Appointment) => void;
  onViewEncounter: (encounterId: string) => void;
  onSendIntake: (appt: Appointment) => void;
}) {
  const canCheckIn =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  const canStartExam = appointment.status === "arrived";
  const hasEncounter = !!appointment.encounterId;
  const isClickable =
    hasEncounter &&
    (appointment.status === "in_exam" || appointment.status === "completed");

  // Build overflow menu items based on status
  const overflowItems: OverflowMenuItem[] = [];

  if (hasEncounter && (appointment.status === "in_exam" || appointment.status === "completed")) {
    overflowItems.push({
      label: appointment.status === "in_exam" ? "Continue Encounter" : "View Encounter",
      onClick: () => onViewEncounter(appointment.encounterShortId!),
    });
  }

  if (canCheckIn) {
    overflowItems.push({
      label: appointment.intakeStatus ? "Resend Intake Form" : "Send Intake Form",
      onClick: () => onSendIntake(appointment),
    });
    overflowItems.push({
      label: "Reschedule",
      onClick: () => onReschedule(appointment),
    });
    overflowItems.push({
      label: "Cancel Appointment",
      onClick: () => onCancel(appointment.id),
      variant: "danger",
    });
  }

  if (canStartExam) {
    overflowItems.push({
      label: "Undo Check-In",
      onClick: () => onRevertCheckIn(appointment.id),
    });
    overflowItems.push({
      label: "Reschedule",
      onClick: () => onReschedule(appointment),
    });
    overflowItems.push({
      label: "Cancel Appointment",
      onClick: () => onCancel(appointment.id),
      variant: "danger",
    });
  }

  if (appointment.status === "completed") {
    overflowItems.push({
      label: "Schedule Follow-Up",
      onClick: () => onFollowUp(appointment),
    });
  }

  const handleCardClick = () => {
    if (isClickable) {
      onViewEncounter(appointment.encounterShortId!);
    }
  };

  return (
    <div
      className={`glass-card glass-card-hover p-4 transition-all${isClickable ? " cursor-pointer" : ""}`}
      onClick={handleCardClick}
      role={isClickable ? "link" : undefined}
    >
      <div className="flex items-center gap-4">
        {/* Color bar */}
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: STATUS_COLORS[appointment.status] }}
        />

        {/* Time */}
        <div className="shrink-0 w-[4.5rem] text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {formatTime(appointment.startTime, tz)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {appointment.durationMinutes} min
          </p>
        </div>

        {/* Patient info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {appointment.patientName ?? "Unknown Patient"}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
            {appointment.providerName && (
              <span> &middot; {appointment.providerName}</span>
            )}
          </p>
          {appointment.chiefComplaint && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 truncate italic">
              {appointment.chiefComplaint}
            </p>
          )}
        </div>

        {/* Status + Triage badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {appointment.intakeStatus === "submitted" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Intake
            </span>
          )}
          {appointment.triageFlags?.urgency === "urgent" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse"
              title={`AI-generated triage — requires clinical review\n${appointment.triageFlags.reasoning}\nFlags: ${appointment.triageFlags.flags?.join(", ") || "none"}`}
            >
              Urgent
            </span>
          )}
          {appointment.triageFlags?.urgency === "moderate" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25"
              title={`AI-generated triage — requires clinical review\n${appointment.triageFlags.reasoning}`}
            >
              Moderate
            </span>
          )}
          <StatusBadge status={appointment.status} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {appointment.intakeStatus === "pending" && (canCheckIn || canStartExam) && (
            <button
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20 transition-colors"
              onClick={() => onSendIntake(appointment)}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Intake Form
            </button>
          )}
          {canCheckIn && (
            <Button size="sm" onClick={() => onCheckIn(appointment.id)}>
              Check In
            </Button>
          )}
          {canStartExam && (
            <Button size="sm" onClick={() => onStartExam(appointment.id)}>
              Start Exam
            </Button>
          )}
          {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book Appointment Modal (also used for follow-ups)
// ---------------------------------------------------------------------------

function BookAppointmentModal({
  open,
  onClose,
  onSubmit,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    patientId: string;
    providerId: string;
    appointmentType: AppointmentType;
    startTime: string;
    durationMinutes: number;
    chiefComplaint: string;
  }) => void;
  defaults?: {
    patientId?: string;
    providerId?: string;
    appointmentType?: AppointmentType;
    patientName?: string;
    providerName?: string;
  };
}) {
  const [patientId, setPatientId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>("comprehensive_exam");
  const [date, setDate] = useState(localDateISO());
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(45);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Staff list for provider dropdown
  const [staffList, setStaffList] = useState<
    { id: string; firstName: string; lastName: string; role: string }[]
  >([]);

  // Patient search
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch staff list when modal opens
  useEffect(() => {
    if (open && staffList.length === 0) {
      apiFetch<{ id: string; firstName: string; lastName: string; role: string }[]>(
        "/api/staff"
      )
        .then((list) => setStaffList(list))
        .catch(() => {});
    }
  }, [open, staffList.length]);

  // Debounced patient search
  useEffect(() => {
    if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    if (patientSearch.length < 2) {
      setPatientResults([]);
      setShowPatientDropdown(false);
      return;
    }
    patientSearchTimer.current = setTimeout(async () => {
      try {
        const data = await apiFetch<PatientListResponse>(
          `/api/patients?search=${encodeURIComponent(patientSearch)}&limit=5`
        );
        setPatientResults(data.items);
        setShowPatientDropdown(data.items.length > 0);
      } catch {
        setPatientResults([]);
      }
    }, 300);
    return () => {
      if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    };
  }, [patientSearch]);

  // Apply defaults when modal opens
  useEffect(() => {
    if (open && defaults) {
      if (defaults.patientId) {
        setPatientId(defaults.patientId);
        setSelectedPatientName(defaults.patientName ?? "");
      }
      if (defaults.providerId) setProviderId(defaults.providerId);
      if (defaults.appointmentType) {
        setAppointmentType(defaults.appointmentType);
        setDuration(APPOINTMENT_TYPE_DURATIONS[defaults.appointmentType]);
      }
    }
    if (!open) {
      setPatientId("");
      setProviderId("");
      setAppointmentType("comprehensive_exam");
      setDate(localDateISO());
      setTime("09:00");
      setDuration(45);
      setChiefComplaint("");
      setPatientSearch("");
      setSelectedPatientName("");
      setPatientResults([]);
      setShowPatientDropdown(false);
    }
  }, [open, defaults]);

  // Update duration when type changes
  useEffect(() => {
    setDuration(APPOINTMENT_TYPE_DURATIONS[appointmentType]);
  }, [appointmentType]);

  // Conflict detection: check for overlapping appointments
  const { appointments: allAppointments } = useAppointmentStore();
  const conflicts = useMemo(() => {
    if (!providerId || !date || !time) return [];
    const newStart = new Date(`${date}T${time}:00`).getTime();
    const newEnd = newStart + duration * 60 * 1000;
    return allAppointments.filter((a) => {
      if (a.providerId !== providerId) return false;
      if (a.status === "cancelled" || a.status === "no_show") return false;
      const aStart = new Date(a.startTime).getTime();
      const aEnd = new Date(a.endTime).getTime();
      return newStart < aEnd && newEnd > aStart;
    });
  }, [allAppointments, providerId, date, time, duration]);

  if (!open) return null;

  const isFollowUp = !!defaults?.patientId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !providerId) return;
    setSubmitting(true);
    try {
      const startTime = new Date(`${date}T${time}:00`).toISOString();
      await onSubmit({
        patientId,
        providerId,
        appointmentType,
        startTime,
        durationMinutes: duration,
        chiefComplaint,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative glass-card p-6 w-full max-w-md mx-4 space-y-4"
      >
        <h2 className="text-heading text-lg">
          {isFollowUp ? "Schedule Follow-Up" : "Book Appointment"}
        </h2>
        {isFollowUp && (defaults?.patientName || defaults?.providerName) && (
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            {defaults?.patientName && <>For {defaults.patientName}</>}
            {defaults?.patientName && defaults?.providerName && " · "}
            {defaults?.providerName && <>with {defaults.providerName}</>}
          </p>
        )}

        <div className="space-y-3">
          {isFollowUp ? (
            <>
              <input type="hidden" value={patientId} />
              <input type="hidden" value={providerId} />
            </>
          ) : (
            <>
              {/* Patient search */}
              <div className="relative">
                <label className="text-caption text-[var(--text-muted)] block mb-1">
                  Patient
                </label>
                {selectedPatientName ? (
                  <div className="glass-input w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                    <span>{selectedPatientName}</span>
                    <button
                      type="button"
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs ml-2"
                      onClick={() => {
                        setPatientId("");
                        setSelectedPatientName("");
                        setPatientSearch("");
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setPatientId("");
                    }}
                    onFocus={() => patientResults.length > 0 && setShowPatientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPatientDropdown(false), 200)}
                    placeholder="Search by name..."
                    className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                    required={!patientId}
                  />
                )}
                {showPatientDropdown && (
                  <div className="absolute z-10 w-full mt-1 glass-card rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--glass-hover)] first:rounded-t-lg last:rounded-b-lg"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPatientId(p.id);
                          setSelectedPatientName(`${p.lastName}, ${p.firstName}`);
                          setPatientSearch("");
                          setShowPatientDropdown(false);
                        }}
                      >
                        <span className="font-medium">{p.lastName}, {p.firstName}</span>
                        <span className="text-[var(--text-muted)] ml-2">
                          DOB {p.dob}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input type="hidden" value={patientId} required />
              </div>

              {/* Provider dropdown */}
              <div>
                <label className="text-caption text-[var(--text-muted)] block mb-1">
                  Provider
                </label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                  required
                >
                  <option value="">Select provider...</option>
                  {staffList
                    .filter((s) => s.role === "doctor" || s.role === "owner")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Dr. {s.firstName} {s.lastName}
                      </option>
                    ))}
                  {staffList
                    .filter((s) => s.role !== "doctor" && s.role !== "owner")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.role})
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Type
            </label>
            <select
              value={appointmentType}
              onChange={(e) =>
                setAppointmentType(e.target.value as AppointmentType)
              }
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
            >
              {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Duration (min)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={5}
              max={240}
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Chief Complaint
            </label>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder={isFollowUp ? "Follow-up visit" : "Optional"}
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <div className="rounded-lg p-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Double-booking detected
            </p>
            {conflicts.map((c) => (
              <p key={c.id} className="text-amber-400/80 pl-5">
                {c.patientName ?? "Patient"} &middot;{" "}
                {APPOINTMENT_TYPE_LABELS[c.appointmentType]} at{" "}
                {formatTime(c.startTime, useAppointmentStore.getState().clinicTimezone)}
              </p>
            ))}
            <p className="text-amber-400/60 pl-5">
              You can still book — this will create a double-booking.
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !patientId || !providerId}
          >
            {submitting ? "Booking..." : isFollowUp ? "Schedule" : "Book"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancel Confirmation Modal
// ---------------------------------------------------------------------------

function CancelModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (reason.length < 3) return;
    setSubmitting(true);
    try {
      await onConfirm(reason);
      setReason("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card p-6 w-full max-w-sm mx-4 space-y-4">
        <h2 className="text-heading text-lg">Cancel Appointment</h2>
        <div>
          <label className="text-caption text-[var(--text-muted)] block mb-1">
            Reason for cancellation
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required (min 3 characters)"
            className="glass-input w-full px-3 py-2 rounded-lg text-sm min-h-[80px] resize-none"
            required
          />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Keep
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={reason.length < 3 || submitting}
          >
            {submitting ? "Cancelling..." : "Cancel Appointment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reschedule Modal
// ---------------------------------------------------------------------------

function RescheduleModal({
  open,
  appointment,
  onClose,
  onConfirm,
}: {
  open: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onConfirm: (id: string, newStartTime: string, newDurationMinutes?: number) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from current appointment
  useEffect(() => {
    if (open && appointment) {
      const start = new Date(appointment.startTime);
      setDate(localDateISO(start));
      setTime(
        start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: useAppointmentStore.getState().clinicTimezone })
      );
      setDuration("");
    }
  }, [open, appointment]);

  if (!open || !appointment) return null;

  const handleConfirm = async () => {
    if (!date || !time) return;
    setSubmitting(true);
    try {
      const newStartTime = new Date(`${date}T${time}:00`).toISOString();
      await onConfirm(
        appointment.id,
        newStartTime,
        duration !== "" ? duration : undefined
      );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card p-6 w-full max-w-sm mx-4 space-y-4">
        <h2 className="text-heading text-lg">Reschedule Appointment</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {appointment.patientName ?? "Patient"} &middot;{" "}
          {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1">
                New Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1">
                New Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Duration (min){" "}
              <span className="text-[var(--text-muted)]">
                — leave blank to keep {appointment.durationMinutes} min
              </span>
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) =>
                setDuration(e.target.value ? Number(e.target.value) : "")
              }
              min={5}
              max={240}
              placeholder={String(appointment.durationMinutes)}
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!date || !time || submitting}
          >
            {submitting ? "Rescheduling..." : "Reschedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const { has } = useEntitlements();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;

  const {
    appointments,
    selectedDate,
    clinicTimezone,
    loading,
    error,
    setSelectedDate,
    fetchAppointments,
    createAppointment,
    cancelAppointment,
    checkInPatient,
    revertCheckIn,
    rescheduleAppointment,
    startExam,
    generateIntakeToken,
  } = useAppointmentStore();

  // View mode: list | timeline | clinic
  type ViewMode = "list" | "timeline" | "clinic";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("schedule-view") as ViewMode) || "list";
    }
    return "list";
  });
  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("schedule-view", mode);
  }, []);

  // Provider filter
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [staffList, setStaffList] = useState<
    { id: string; firstName: string; lastName: string; role: string }[]
  >([]);

  // Fetch staff list for provider filter
  useEffect(() => {
    apiFetch<{ id: string; firstName: string; lastName: string; role: string }[]>(
      "/api/staff"
    )
      .then((list) => setStaffList(list))
      .catch(() => {});
  }, []);

  // Re-fetch when provider filter changes
  useEffect(() => {
    fetchAppointments(selectedDate, selectedProviderId || undefined);
  }, [selectedProviderId, selectedDate, fetchAppointments]);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDefaults, setBookingDefaults] = useState<{
    patientId?: string;
    providerId?: string;
    appointmentType?: AppointmentType;
    patientName?: string;
    providerName?: string;
  } | undefined>(undefined);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [intakeLinkData, setIntakeLinkData] = useState<{
    url: string;
    patientName: string;
    appointmentDate: string;
  } | null>(null);

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  // Auto-open follow-up modal from query params (e.g. from encounter page)
  useEffect(() => {
    if (searchParams.get("followUp") === "true") {
      const pid = searchParams.get("patientId");
      const provId = searchParams.get("providerId");
      if (pid && provId) {
        setBookingDefaults({
          patientId: pid,
          providerId: provId,
          patientName: searchParams.get("patientName") || undefined,
          providerName: searchParams.get("providerName") || undefined,
        });
        setBookingOpen(true);
        // Clean up URL params
        router.replace(`/${tenant}/schedule`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Note: fetching is handled by the provider filter effect above

  // Subtitle
  useEffect(() => {
    const isToday = selectedDate === localDateISO();
    setSubtitle(formatDateDisplay(selectedDate) + (isToday ? " · Today" : ""));
    return () => setSubtitle(null);
  }, [selectedDate, setSubtitle]);

  // Auto-clear action error after 5s
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timer);
  }, [actionError]);

  // Handlers
  const handleCheckIn = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await checkInPatient(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Check-in failed";
        setActionError(msg);
      }
    },
    [checkInPatient]
  );

  const handleStartExam = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        const result = await startExam(id);
        router.push(`/${tenant}/encounter/${result.encounterShortId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Start exam failed";
        setActionError(msg);
      }
    },
    [startExam, router, tenant]
  );

  const handleCancel = useCallback(
    async (reason: string) => {
      if (!cancelTarget) return;
      setActionError(null);
      try {
        await cancelAppointment(cancelTarget, reason);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Cancel failed";
        setActionError(msg);
      }
    },
    [cancelTarget, cancelAppointment]
  );

  const handleRevertCheckIn = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await revertCheckIn(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Undo check-in failed";
        setActionError(msg);
      }
    },
    [revertCheckIn]
  );

  const handleReschedule = useCallback(
    async (id: string, newStartTime: string, newDurationMinutes?: number) => {
      setActionError(null);
      try {
        await rescheduleAppointment(id, newStartTime, newDurationMinutes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Reschedule failed";
        setActionError(msg);
      }
    },
    [rescheduleAppointment]
  );

  const handleFollowUp = useCallback((appt: Appointment) => {
    setBookingDefaults({
      patientId: appt.patientId,
      providerId: appt.providerId,
      appointmentType: appt.appointmentType,
      patientName: appt.patientName ?? undefined,
    });
    setBookingOpen(true);
  }, []);

  const handleSendIntake = useCallback(
    async (appt: Appointment) => {
      setActionError(null);
      try {
        const result = await generateIntakeToken(appt.id);
        setIntakeLinkData({
          url: result.url,
          patientName: appt.patientName ?? "Patient",
          appointmentDate: formatDateDisplay(appt.startTime.split("T")[0]),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to generate intake link";
        setActionError(msg);
      }
    },
    [generateIntakeToken]
  );

  const handleBook = useCallback(
    async (data: {
      patientId: string;
      providerId: string;
      appointmentType: AppointmentType;
      startTime: string;
      durationMinutes: number;
      chiefComplaint: string;
    }) => {
      await createAppointment({
        patientId: data.patientId,
        providerId: data.providerId,
        appointmentType: data.appointmentType,
        startTime: data.startTime,
        durationMinutes: data.durationMinutes,
        chiefComplaint: data.chiefComplaint || undefined,
      });
    },
    [createAppointment]
  );

  // Entitlement gate
  if (!has(Entitlement.SCHEDULING)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect
                x="3"
                y="8"
                width="14"
                height="10"
                rx="2"
                stroke="var(--text-muted)"
                strokeWidth="1.4"
              />
              <path
                d="M6 8V6a4 4 0 018 0v2"
                stroke="var(--text-muted)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
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

  // Group appointments by status for summary counters
  const statusCounts = appointments.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Toolbar: summary left, controls right */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left — summary counters */}
        <div className="flex items-center gap-2 flex-wrap">
          {appointments.length > 0 ? (
            <>
              {Object.entries(statusCounts).map(([status, count]) => {
                const color = STATUS_COLORS[status as AppointmentStatus];
                return (
                  <Badge key={status} variant="outline" className="gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {STATUS_LABELS[status as AppointmentStatus]} {count}
                  </Badge>
                );
              })}
              <Badge variant="secondary">{appointments.length} total</Badge>
            </>
          ) : null}
        </div>

        {/* Right — provider filter, view toggle, date nav, book */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Provider filter */}
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="glass-input px-2 py-1.5 rounded-lg text-xs h-8"
          >
            <option value="">All Providers</option>
            {staffList
              .filter((s) => s.role === "doctor" || s.role === "owner")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  Dr. {s.firstName} {s.lastName}
                </option>
              ))}
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            {(["list", "timeline", "clinic"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewChange(mode)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {mode === "list" ? "List" : mode === "timeline" ? "Timeline" : "Clinic"}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-[var(--border-subtle)]" />

          {/* Date nav */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            title="Previous day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDate(localDateISO())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            title="Next day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="glass-input px-3 py-1.5 rounded-lg text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              setBookingDefaults(undefined);
              setBookingOpen(true);
            }}
          >
            + Book
          </Button>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
          <span className="flex-1">{actionError}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Appointment list */}
      {loading ? (
        <div className="glass-card flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <svg
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                opacity="0.25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-body">Loading appointments...</span>
          </div>
        </div>
      ) : error ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-body text-red-500">{error}</p>
          <Button variant="outline" onClick={() => fetchAppointments(selectedDate)}>
            Retry
          </Button>
        </div>
      ) : appointments.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect
                x="2"
                y="3.5"
                width="16"
                height="14"
                rx="2.5"
                stroke="var(--text-muted)"
                strokeWidth="1.3"
              />
              <path
                d="M2 8h16M7 3.5v4M13 3.5v4"
                stroke="var(--text-muted)"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">No appointments</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              No appointments scheduled for this day.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setBookingDefaults(undefined);
              setBookingOpen(true);
            }}
          >
            Book an appointment
          </Button>
        </div>
      ) : viewMode === "timeline" ? (
        <TimelineView
          appointments={appointments}
          selectedDate={selectedDate}
          onAppointmentClick={(appt) => {
            // For appointments with encounters, navigate; otherwise open reschedule
            if (appt.encounterId && (appt.status === "in_exam" || appt.status === "completed")) {
              router.push(`/${tenant}/encounter/${appt.encounterShortId}`);
            } else if (appt.status === "scheduled" || appt.status === "confirmed") {
              setRescheduleTarget(appt);
            }
          }}
          onSlotClick={(time) => {
            setBookingDefaults(undefined);
            setBookingOpen(true);
          }}
        />
      ) : viewMode === "clinic" ? (
        <ClinicView
          appointments={appointments}
          selectedDate={selectedDate}
          selectedProviderId={selectedProviderId || undefined}
          onAppointmentClick={(appt) => {
            if (appt.encounterId && (appt.status === "in_exam" || appt.status === "completed")) {
              router.push(`/${tenant}/encounter/${appt.encounterShortId}`);
            } else if (appt.status === "scheduled" || appt.status === "confirmed") {
              setRescheduleTarget(appt);
            }
          }}
          onSlotClick={(time, providerId) => {
            setBookingDefaults(providerId ? { providerId } : undefined);
            setBookingOpen(true);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {appointments.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              tz={clinicTimezone}
              onCheckIn={handleCheckIn}
              onStartExam={handleStartExam}
              onCancel={(id) => setCancelTarget(id)}
              onRevertCheckIn={handleRevertCheckIn}
              onReschedule={(a) => setRescheduleTarget(a)}
              onFollowUp={handleFollowUp}
              onViewEncounter={(encId) => router.push(`/${tenant}/encounter/${encId}`)}
              onSendIntake={handleSendIntake}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <BookAppointmentModal
        open={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          setBookingDefaults(undefined);
        }}
        onSubmit={handleBook}
        defaults={bookingDefaults}
      />
      <CancelModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
      />
      <RescheduleModal
        open={rescheduleTarget !== null}
        appointment={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onConfirm={handleReschedule}
      />
      <IntakeLinkModal
        isOpen={intakeLinkData !== null}
        onClose={() => setIntakeLinkData(null)}
        url={intakeLinkData?.url ?? ""}
        patientName={intakeLinkData?.patientName ?? ""}
        appointmentDate={intakeLinkData?.appointmentDate ?? ""}
      />
    </div>
  );
}
