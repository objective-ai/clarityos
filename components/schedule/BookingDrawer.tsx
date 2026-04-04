"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { AppointmentType } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_DURATIONS,
} from "@/types/appointment";
import type { Appointment } from "@/types/appointment";
import { useAppointmentStore } from "@/store/appointmentStore";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  clinicToday,
  clinicLocalToUTC,
  formatClinicTime,
} from "@/lib/timezone";
import { isSlotOccupied } from "@/lib/scheduleUtils";
import type { BookingDefaults } from "@/types/schedule";
import type { PatientSummary, PatientListResponse } from "@/types/patient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingDrawerProps {
  open: boolean;
  onClose: () => void;
  allAppointments: Appointment[];
  staffList: { id: string; full_name: string }[];
  tenant: string;
  timezone: string;
  defaults?: BookingDefaults;
}

// ---------------------------------------------------------------------------
// Slot grid helpers
// ---------------------------------------------------------------------------

const CLINIC_START_HOUR = 8;
const CLINIC_END_HOUR = 18; // 6 PM — exclusive

/** Generate 30-min slots as HH:MM strings between clinic hours. */
function generateSlots(): string[] {
  const slots: string[] = [];
  for (let h = CLINIC_START_HOUR; h < CLINIC_END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const SLOTS = generateSlots(); // 20 slots (8:00 AM – 5:30 PM)

/** Build an ISO UTC datetime for a given date + HH:MM local time + timezone. */
function slotToISO(dateStr: string, timeStr: string, tz: string): string {
  return clinicLocalToUTC(dateStr, timeStr, tz);
}

/** Add minutes to an ISO string, return ISO string. */
function addMinutesToISO(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

/** Find the appointment occupying a slot for a given provider. */
function getOccupyingAppointment(
  slotStartISO: string,
  slotEndISO: string,
  appointments: Appointment[]
): Appointment | undefined {
  const sStart = new Date(slotStartISO).getTime();
  const sEnd = new Date(slotEndISO).getTime();
  return appointments.find((a) => {
    if (a.status === "cancelled" || a.status === "no_show") return false;
    const aStart = new Date(a.startTime).getTime();
    const aEnd = new Date(a.endTime).getTime();
    return sStart < aEnd && sEnd > aStart;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingDrawer({
  open,
  onClose,
  allAppointments,
  staffList,
  timezone,
  defaults,
}: BookingDrawerProps) {
  const clinicTimezone = useAppointmentStore((s) => s.clinicTimezone);
  const selectedDate = useAppointmentStore((s) => s.selectedDate);
  const createAppointment = useAppointmentStore((s) => s.createAppointment);
  const fetchAppointments = useAppointmentStore((s) => s.fetchAppointments);

  const tz = timezone || clinicTimezone || "America/Los_Angeles";

  // Form state
  const [providerId, setProviderId] = useState("");
  const [date, setDate] = useState(clinicToday(tz));
  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>("comprehensive_exam");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null); // HH:MM
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Patient search state
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSummary[]>([]);
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New patient inline form
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newSex, setNewSex] = useState<"male" | "female" | "other">("male");
  const [newPhone, setNewPhone] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);

  // ESC key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Apply defaults and reset when drawer opens/closes
  useEffect(() => {
    if (open) {
      setDate(defaults?.date ?? selectedDate ?? clinicToday(tz));
      setProviderId(defaults?.providerId ?? "");
      setSelectedSlot(
        defaults?.startTime
          ? (() => {
              // Extract HH:MM from ISO string in clinic tz
              const t = new Date(defaults.startTime).toLocaleTimeString(
                "en-GB",
                { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }
              );
              return t;
            })()
          : null
      );
      if (defaults?.patientId) {
        setPatientId(defaults.patientId);
        setSelectedPatientName(defaults.patientName ?? "");
      }
      setSubmitError(null);
    } else {
      // Reset all state when closed
      setProviderId("");
      setDate(clinicToday(tz));
      setAppointmentType("comprehensive_exam");
      setSelectedSlot(null);
      setChiefComplaint("");
      setPatientId("");
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
      setSubmitError(null);
    }
  }, [open, defaults, selectedDate, tz]);

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

  // Duration for selected type
  const duration = APPOINTMENT_TYPE_DURATIONS[appointmentType];

  // Filter appointments to selected provider
  const providerAppointments = useMemo(() => {
    if (!providerId) return [];
    return allAppointments.filter((a) => a.providerId === providerId);
  }, [allAppointments, providerId]);

  // Compute slot occupancy
  const slotStates = useMemo(() => {
    return SLOTS.map((slot) => {
      const slotStartISO = slotToISO(date, slot, tz);
      const slotEndISO = addMinutesToISO(slotStartISO, duration);
      const occupied = isSlotOccupied(slotStartISO, slotEndISO, providerAppointments);
      const occupant = occupied
        ? getOccupyingAppointment(slotStartISO, slotEndISO, providerAppointments)
        : undefined;
      return { slot, slotStartISO, slotEndISO, occupied, occupant };
    });
  }, [date, duration, providerAppointments, tz]);

  // Conflict warning: selected slot is occupied (overbooking)
  const conflictWarning = useMemo(() => {
    if (!selectedSlot) return false;
    const state = slotStates.find((s) => s.slot === selectedSlot);
    return state?.occupied ?? false;
  }, [selectedSlot, slotStates]);

  // Create new patient
  const handleCreatePatient = useCallback(async () => {
    setCreatingPatient(true);
    try {
      const created = await apiFetch<{
        id: string;
        firstName: string;
        lastName: string;
      }>("/api/patients", {
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
      // stay on form so user can retry
    } finally {
      setCreatingPatient(false);
    }
  }, [newFirst, newLast, newDob, newSex, newPhone]);

  // Submit booking
  const handleSubmit = useCallback(async () => {
    if (!patientId || !providerId || !selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const startTime = slotToISO(date, selectedSlot, tz);
      await createAppointment({
        patientId,
        providerId,
        appointmentType,
        startTime,
        durationMinutes: duration,
        chiefComplaint: chiefComplaint.trim() || undefined,
      });
      // Refresh appointments for the current view
      await fetchAppointments(date, providerId || undefined);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to book appointment."
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    patientId,
    providerId,
    selectedSlot,
    date,
    tz,
    appointmentType,
    duration,
    chiefComplaint,
    createAppointment,
    fetchAppointments,
    onClose,
  ]);

  if (!open) return null;

  const canSubmit = !!patientId && !!providerId && !!selectedSlot && !submitting;

  // Staff list normalized (BookingDrawer receives { id, full_name })
  const providerOptions = staffList;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer shell */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-[var(--bg-base)] border-l border-[var(--border-default)] shadow-2xl transition-transform duration-200 ease-out w-full sm:w-[480px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">
            Book Appointment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--bg-elevated)]"
            aria-label="Close booking drawer"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* Provider selector */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1.5">
                Provider
              </label>
              <select
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setSelectedSlot(null);
                }}
                aria-label="Provider"
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              >
                <option value="">Select provider...</option>
                {providerOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date selector */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={date}
                min={clinicToday(tz)}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedSlot(null);
                }}
                aria-label="Appointment date"
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              />
            </div>

            {/* Appointment type */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1.5">
                Appointment Type
              </label>
              <select
                value={appointmentType}
                onChange={(e) => {
                  setAppointmentType(e.target.value as AppointmentType);
                  setSelectedSlot(null);
                }}
                aria-label="Appointment type"
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              >
                {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v} — {APPOINTMENT_TYPE_DURATIONS[k as AppointmentType]} min
                  </option>
                ))}
              </select>
            </div>

            {/* Slot picker grid */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-2">
                Select Time Slot
                {!providerId && (
                  <span className="text-[var(--text-muted)] ml-1">
                    (select a provider first)
                  </span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {slotStates.map(({ slot, slotStartISO, occupied, occupant }) => {
                  const isSelected = selectedSlot === slot;
                  const displayTime = formatClinicTime(slotStartISO, tz);

                  if (occupied && !isSelected) {
                    return (
                      <div
                        key={slot}
                        title={
                          occupant?.patientName
                            ? `${occupant.patientName}`
                            : "Occupied"
                        }
                        className="relative group px-2 py-2 rounded-lg text-center text-xs border border-[var(--border-subtle)] bg-white/2 text-[var(--text-secondary)] cursor-not-allowed select-none"
                      >
                        {displayTime}
                        {/* Tooltip */}
                        {occupant?.patientName && (
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 text-[10px] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {occupant.patientName}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!providerId}
                      onClick={() =>
                        setSelectedSlot(isSelected ? null : slot)
                      }
                      className={`px-2 py-2 rounded-lg text-center text-xs border transition-colors duration-150 ${
                        isSelected
                          ? "bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] font-medium"
                          : occupied
                          ? "bg-[#FBBF24]/10 border-[#FBBF24]/30 text-[#FBBF24] hover:bg-[#FBBF24]/20"
                          : "bg-white/5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/30"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {displayTime}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Conflict warning banner */}
            {conflictWarning && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24]">
                <svg
                  className="w-4 h-4 shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-xs leading-relaxed">
                  This slot already has an appointment. Proceeding will overbook
                  the provider.
                </p>
              </div>
            )}

            {/* Patient section */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1.5">
                Patient
              </label>

              {selectedPatientName ? (
                /* Selected patient display */
                <div className="glass-input w-full px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span className="text-[var(--text-primary)]">
                    {selectedPatientName}
                  </span>
                  <button
                    type="button"
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs ml-2 shrink-0"
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
                    />
                    <input
                      type="text"
                      value={newLast}
                      onChange={(e) => setNewLast(e.target.value)}
                      placeholder="Last name *"
                      className="glass-input px-2 py-1.5 rounded-lg text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newDob}
                      onChange={(e) => setNewDob(e.target.value)}
                      className="glass-input px-2 py-1.5 rounded-lg text-sm"
                      aria-label="Date of birth"
                    />
                    <select
                      value={newSex}
                      onChange={(e) =>
                        setNewSex(e.target.value as "male" | "female" | "other")
                      }
                      className="glass-input px-2 py-1.5 rounded-lg text-sm"
                      aria-label="Biological sex"
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
                      disabled={
                        creatingPatient || !newFirst || !newLast || !newDob
                      }
                      onClick={handleCreatePatient}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
                /* Patient search input */
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setPatientId("");
                    }}
                    onFocus={() =>
                      patientResults.length > 0 && setShowPatientDropdown(true)
                    }
                    onBlur={() =>
                      setTimeout(() => setShowPatientDropdown(false), 200)
                    }
                    placeholder="Search by name..."
                    className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 mt-1.5 block"
                    onClick={() => setShowNewPatient(true)}
                  >
                    + New Patient
                  </button>

                  {/* Search results dropdown */}
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
                            setSelectedPatientName(
                              p.preferredName
                                ? `${p.lastName}, ${p.firstName} "${p.preferredName}"`
                                : `${p.lastName}, ${p.firstName}`
                            );
                            setPatientSearch("");
                            setShowPatientDropdown(false);
                          }}
                        >
                          <span className="font-medium">
                            {p.lastName}, {p.firstName}
                            {p.preferredName && (
                              <span className="font-normal text-[var(--text-secondary)]">
                                {" "}
                                &ldquo;{p.preferredName}&rdquo;
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
                </div>
              )}
            </div>

            {/* Chief complaint */}
            <div>
              <label className="text-caption text-[var(--text-muted)] block mb-1.5">
                Chief Complaint{" "}
                <span className="text-[var(--text-muted)] font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g. blurry vision, eye pain..."
                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
              />
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {submitError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] shrink-0">
          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Booking..." : "Confirm Booking"}
          </Button>
          {!selectedSlot && (
            <p className="text-center text-xs text-[var(--text-muted)] mt-2">
              Select a time slot to continue
            </p>
          )}
        </div>
      </div>
    </>
  );
}
