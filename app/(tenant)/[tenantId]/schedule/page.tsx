"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useAppointmentStore } from "@/store/appointmentStore";
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${STATUS_COLORS[status]} 15%, transparent)`,
        color: STATUS_COLORS[status],
        border: `1px solid color-mix(in srgb, ${STATUS_COLORS[status]} 30%, transparent)`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Appointment Card
// ---------------------------------------------------------------------------

function AppointmentCard({
  appointment,
  onCheckIn,
  onStartExam,
  onCancel,
}: {
  appointment: Appointment;
  onCheckIn: (id: string) => void;
  onStartExam: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const canCheckIn =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  const canStartExam = appointment.status === "arrived";
  const isActive =
    appointment.status !== "cancelled" &&
    appointment.status !== "no_show" &&
    appointment.status !== "completed";

  return (
    <div className="glass-card glass-card-hover p-4 transition-all">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Time + Patient */}
        <div className="flex gap-3 min-w-0">
          {/* Time column */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <span className="text-subhead text-sm">
              {formatTime(appointment.startTime)}
            </span>
            <span className="text-caption text-[var(--text-muted)] text-xs">
              {appointment.durationMinutes}m
            </span>
          </div>

          {/* Divider */}
          <div
            className="w-0.5 self-stretch rounded-full shrink-0"
            style={{
              backgroundColor: STATUS_COLORS[appointment.status],
              opacity: 0.5,
            }}
          />

          {/* Patient info */}
          <div className="min-w-0">
            <p className="text-subhead truncate">
              {appointment.patientName ?? "Unknown Patient"}
            </p>
            <p className="text-caption text-[var(--text-muted)]">
              {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
              {appointment.providerName && (
                <span> &middot; {appointment.providerName}</span>
              )}
            </p>
            {appointment.chiefComplaint && (
              <p className="text-caption text-[var(--text-secondary)] mt-1 truncate">
                CC: {appointment.chiefComplaint}
              </p>
            )}
          </div>
        </div>

        {/* Right: Status + Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={appointment.status} />

          {isActive && (
            <div className="flex gap-1.5">
              {canCheckIn && (
                <button
                  onClick={() => onCheckIn(appointment.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors"
                >
                  Check In
                </button>
              )}
              {canStartExam && (
                <button
                  onClick={() => onStartExam(appointment.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 transition-all"
                >
                  Start Exam
                </button>
              )}
              {canCheckIn && (
                <button
                  onClick={() => onCancel(appointment.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-red-500 transition-colors"
                  title="Cancel appointment"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book Appointment Modal
// ---------------------------------------------------------------------------

function BookAppointmentModal({
  open,
  onClose,
  onSubmit,
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
}) {
  const [patientId, setPatientId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>("comprehensive_exam");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(45);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Update duration when type changes
  useEffect(() => {
    setDuration(APPOINTMENT_TYPE_DURATIONS[appointmentType]);
  }, [appointmentType]);

  if (!open) return null;

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
        <h2 className="text-heading text-lg">Book Appointment</h2>

        <div className="space-y-3">
          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Patient ID
            </label>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter patient UUID"
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="text-caption text-[var(--text-muted)] block mb-1">
              Provider ID
            </label>
            <input
              type="text"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="Enter provider UUID"
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              required
            />
          </div>

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
              placeholder="Optional"
              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !patientId || !providerId}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {submitting ? "Booking..." : "Book"}
          </button>
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Keep
          </button>
          <button
            onClick={handleConfirm}
            disabled={reason.length < 3 || submitting}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-all"
          >
            {submitting ? "Cancelling..." : "Cancel Appointment"}
          </button>
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
  const tenantId = params.tenantId as string;

  const {
    appointments,
    selectedDate,
    loading,
    error,
    setSelectedDate,
    fetchAppointments,
    createAppointment,
    cancelAppointment,
    checkInPatient,
    startExam,
  } = useAppointmentStore();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  // Fetch appointments when date changes
  useEffect(() => {
    fetchAppointments(selectedDate);
  }, [selectedDate, fetchAppointments]);

  // Handlers
  const handleCheckIn = useCallback(
    async (id: string) => {
      try {
        await checkInPatient(id);
      } catch (err) {
        console.error("Check-in failed:", err);
      }
    },
    [checkInPatient]
  );

  const handleStartExam = useCallback(
    async (id: string) => {
      try {
        const result = await startExam(id);
        // Navigate to the encounter
        router.push(`/${tenantId}/encounter/${result.encounterId}`);
      } catch (err) {
        console.error("Start exam failed:", err);
      }
    },
    [startExam, router, tenantId]
  );

  const handleCancel = useCallback(
    async (reason: string) => {
      if (!cancelTarget) return;
      try {
        await cancelAppointment(cancelTarget, reason);
      } catch (err) {
        console.error("Cancel failed:", err);
      }
    },
    [cancelTarget, cancelAppointment]
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

  const isToday =
    selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-display text-2xl">Schedule</h1>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            {formatDateDisplay(selectedDate)}
            {isToday && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-inverse)]">
                Today
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
              className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
              title="Previous day"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 4l-4 4 4 4" />
              </svg>
            </button>
            <button
              onClick={() =>
                setSelectedDate(new Date().toISOString().slice(0, 10))
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
              title="Next day"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          </div>

          {/* Date picker */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="glass-input px-3 py-1.5 rounded-lg text-sm"
          />

          {/* Book button */}
          <button
            onClick={() => setBookingOpen(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 transition-all shadow-[var(--shadow-sm)]"
          >
            + Book
          </button>
        </div>
      </div>

      {/* Summary counters */}
      {appointments.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="glass-card px-3 py-2 flex items-center gap-2"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    STATUS_COLORS[status as AppointmentStatus],
                }}
              />
              <span className="text-caption text-[var(--text-secondary)]">
                {STATUS_LABELS[status as AppointmentStatus]}: {count}
              </span>
            </div>
          ))}
          <div className="glass-card px-3 py-2">
            <span className="text-caption text-[var(--text-secondary)]">
              Total: {appointments.length}
            </span>
          </div>
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
          <button
            onClick={() => fetchAppointments(selectedDate)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            Retry
          </button>
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
          <button
            onClick={() => setBookingOpen(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            Book an appointment
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {appointments.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appointment={appt}
              onCheckIn={handleCheckIn}
              onStartExam={handleStartExam}
              onCancel={(id) => setCancelTarget(id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <BookAppointmentModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onSubmit={handleBook}
      />
      <CancelModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
      />
    </div>
  );
}
