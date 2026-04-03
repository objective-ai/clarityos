"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { AppointmentType } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_DURATIONS,
} from "@/types/appointment";
import { useAppointmentStore } from "@/store/appointmentStore";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { clinicToday, clinicLocalToUTC, formatClinicTime } from "@/lib/timezone";
import type { PatientSummary, PatientListResponse } from "@/types/patient";

export function BookAppointmentModal({
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
  const clinicTimezone = useAppointmentStore((s) => s.clinicTimezone);
  const allAppointments = useAppointmentStore((s) => s.appointments);

  const [patientId, setPatientId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>("comprehensive_exam");
  const [date, setDate] = useState(clinicToday(clinicTimezone));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(45);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Inline new-patient quick-create
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newSex, setNewSex] = useState<"male" | "female" | "other">("male");
  const [newPhone, setNewPhone] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);

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
      setDate(clinicToday(clinicTimezone));
      setTime("09:00");
      setDuration(45);
      setChiefComplaint("");
      setPatientSearch("");
      setSelectedPatientName("");
      setPatientResults([]);
      setShowPatientDropdown(false);
      setShowNewPatient(false);
      setNewFirst("");
      setNewLast("");
      setNewDob("");
      setNewSex("male");
      setNewPhone("");
    }
  }, [open, defaults, clinicTimezone]);

  // Update duration when type changes
  useEffect(() => {
    setDuration(APPOINTMENT_TYPE_DURATIONS[appointmentType]);
  }, [appointmentType]);

  // Conflict detection
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
      const tz = clinicTimezone || "America/Los_Angeles";
      const startTime = clinicLocalToUTC(date, time, tz);
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
              {/* Patient search / quick-create */}
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
                        setShowNewPatient(false);
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : showNewPatient ? (
                  /* Inline new patient form */
                  <div className="space-y-2 rounded-lg border border-[var(--glass-border)] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newFirst}
                        onChange={(e) => setNewFirst(e.target.value)}
                        placeholder="First name *"
                        className="glass-input px-2 py-1.5 rounded-lg text-sm"
                        required={!patientId}
                      />
                      <input
                        type="text"
                        value={newLast}
                        onChange={(e) => setNewLast(e.target.value)}
                        placeholder="Last name *"
                        className="glass-input px-2 py-1.5 rounded-lg text-sm"
                        required={!patientId}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={newDob}
                        onChange={(e) => setNewDob(e.target.value)}
                        className="glass-input px-2 py-1.5 rounded-lg text-sm"
                        required={!patientId}
                        title="Date of birth"
                      />
                      <select
                        value={newSex}
                        onChange={(e) => setNewSex(e.target.value as "male" | "female" | "other")}
                        className="glass-input px-2 py-1.5 rounded-lg text-sm"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="glass-input w-full px-2 py-1.5 rounded-lg text-sm"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={creatingPatient || !newFirst || !newLast || !newDob}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-40"
                        onClick={async () => {
                          setCreatingPatient(true);
                          try {
                            const created = await apiFetch<{ id: string; firstName: string; lastName: string }>("/api/patients", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                firstName: newFirst.trim(),
                                lastName: newLast.trim(),
                                dob: newDob,
                                sex: newSex,
                                ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
                              }),
                            });
                            setPatientId(created.id);
                            setSelectedPatientName(`${created.lastName}, ${created.firstName}`);
                            setShowNewPatient(false);
                          } catch {
                            // stay on the form so user can retry
                          } finally {
                            setCreatingPatient(false);
                          }
                        }}
                      >
                        {creatingPatient ? "Creating..." : "Create & Select"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={() => setShowNewPatient(false)}
                      >
                        Back to search
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
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
                    <button
                      type="button"
                      className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 mt-1"
                      onClick={() => setShowNewPatient(true)}
                    >
                      + New Patient
                    </button>
                  </>
                )}
                {showPatientDropdown && !showNewPatient && (
                  <div className="absolute z-10 w-full mt-1 glass-card rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--glass-hover)] first:rounded-t-lg last:rounded-b-lg"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPatientId(p.id);
                          setSelectedPatientName(
                            p.preferredName
                              ? `${p.lastName}, ${p.firstName} "${p.preferredName}"`
                              : `${p.lastName}, ${p.firstName}`,
                          );
                          setPatientSearch("");
                          setShowPatientDropdown(false);
                        }}
                      >
                        <span className="font-medium">
                          {p.lastName}, {p.firstName}
                          {p.preferredName && (
                            <span className="font-normal text-[var(--text-secondary)]">
                              {" "}&ldquo;{p.preferredName}&rdquo;
                            </span>
                          )}
                        </span>
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
                {formatClinicTime(c.startTime, clinicTimezone)}
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
