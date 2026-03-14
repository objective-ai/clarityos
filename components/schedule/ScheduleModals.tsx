"use client";

import { useState, useEffect } from "react";
import type { Appointment } from "@/types/appointment";
import { APPOINTMENT_TYPE_LABELS } from "@/types/appointment";
import { useAppointmentStore } from "@/store/appointmentStore";
import { Button } from "@/components/ui/button";
import { clinicDateISO, clinicLocalToUTC } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Cancel Confirmation Modal
// ---------------------------------------------------------------------------

export function CancelModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
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

export function RescheduleModal({
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
  const clinicTimezone = useAppointmentStore((s) => s.clinicTimezone);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from current appointment
  useEffect(() => {
    if (open && appointment) {
      const tz = clinicTimezone || "America/Los_Angeles";
      setDate(clinicDateISO(appointment.startTime, tz));
      setTime(
        new Date(appointment.startTime).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz,
        })
      );
      setDuration("");
    }
  }, [open, appointment, clinicTimezone]);

  if (!open || !appointment) return null;

  const handleConfirm = async () => {
    if (!date || !time) return;
    setSubmitting(true);
    try {
      const tz = clinicTimezone || "America/Los_Angeles";
      const newStartTime = clinicLocalToUTC(date, time, tz);
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
