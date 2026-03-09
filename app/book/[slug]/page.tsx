"use client";

/**
 * app/book/[slug]/page.tsx
 *
 * Public self-serve booking page — no auth required.
 * 3-step wizard: Select Type + Provider → Pick Date + Time → Patient Info + Confirm
 * → Confirmation screen with intake form link.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type {
  BookingClinicInfo,
  BookableType,
  BookingProvider,
  AvailabilityResponse,
  PublicBookingResponse,
} from "@/types/booking";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ["Appointment", "Date & Time", "Your Info", "Confirmed"] as const;

const TYPE_ICONS: Record<string, string> = {
  comprehensive_exam: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  contact_lens_exam: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  pediatric_exam: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
};

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// ---------------------------------------------------------------------------
// Shell — page wrapper
// ---------------------------------------------------------------------------

function Shell({
  children,
  clinicName,
  step,
}: {
  children: React.ReactNode;
  clinicName?: string;
  step?: number;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[var(--accent)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          {clinicName && (
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{clinicName}</h1>
          )}
          <p className="text-sm text-[var(--text-secondary)]">Book an Appointment</p>
        </div>

        {/* Step indicator */}
        {step !== undefined && step < STEPS.length - 1 && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.slice(0, -1).map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                    i <= step
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {i + 1}
                </div>
                {i < STEPS.length - 2 && (
                  <div className={`w-8 h-px ${i < step ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)]"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content card */}
        <div className="rounded-xl border border-white/8 bg-[var(--bg-surface)] p-6 shadow-lg">
          {children}
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Your information is encrypted and protected under HIPAA.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clinicInfo, setClinicInfo] = useState<BookingClinicInfo | null>(null);

  // Step 1
  const [selectedType, setSelectedType] = useState<BookableType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<BookingProvider | null>(null);

  // Step 2
  const [selectedDate, setSelectedDate] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Step 3
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Step 4
  const [confirmation, setConfirmation] = useState<PublicBookingResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Wizard step
  const [step, setStep] = useState(0);

  // ---------------------------------------------------------------------------
  // Fetch clinic info on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/public/booking/${slug}/info`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.detail ?? `Clinic not found (${res.status})`);
        }
        return res.json();
      })
      .then((data: BookingClinicInfo) => {
        setClinicInfo(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // ---------------------------------------------------------------------------
  // Fetch availability when date/provider/type change
  // ---------------------------------------------------------------------------

  const fetchAvailability = useCallback(async () => {
    if (!slug || !selectedDate || !selectedProvider || !selectedType) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const qs = new URLSearchParams({
        date: selectedDate,
        provider_id: selectedProvider.id,
        appointment_type: selectedType.value,
      });
      const res = await fetch(`/api/public/booking/${slug}/availability?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail ?? "Failed to load availability");
      }
      const data: AvailabilityResponse = await res.json();
      setAvailability(data);
    } catch (err) {
      setAvailability(null);
      setError(err instanceof Error ? err.message : "Failed to load availability");
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, selectedDate, selectedProvider, selectedType]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // ---------------------------------------------------------------------------
  // Date constraints
  // ---------------------------------------------------------------------------

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // ---------------------------------------------------------------------------
  // Group slots by morning/afternoon
  // ---------------------------------------------------------------------------

  const groupedSlots = useMemo(() => {
    if (!availability?.slots.length) return { morning: [], afternoon: [] };
    const morning: string[] = [];
    const afternoon: string[] = [];
    for (const slot of availability.slots) {
      const d = new Date(slot);
      if (d.getUTCHours() < 12) morning.push(slot);
      else afternoon.push(slot);
    }
    return { morning, afternoon };
  }, [availability]);

  // ---------------------------------------------------------------------------
  // Submit booking
  // ---------------------------------------------------------------------------

  // Validation
  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "Required";
    if (!lastName.trim()) errs.lastName = "Required";
    if (!dob) errs.dob = "Required";
    if (!sex) errs.sex = "Required";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "Invalid email";
    if (phone.trim() && !/^[\d\s()+-]{7,20}$/.test(phone.trim()))
      errs.phone = "Invalid phone";
    return errs;
  }, [firstName, lastName, dob, sex, email, phone]);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleSubmit = async () => {
    if (!slug || !selectedType || !selectedProvider || !selectedSlot) return;
    // Mark all required fields as touched to show errors
    setTouched({ firstName: true, lastName: true, dob: true, sex: true, email: true, phone: true });
    if (Object.keys(validationErrors).length > 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/booking/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          sex,
          phone: phone.trim() || null,
          email: email.trim() || null,
          provider_id: selectedProvider.id,
          appointment_type: selectedType.value,
          start_time: selectedSlot,
          chief_complaint: chiefComplaint.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail ?? "Booking failed. Please try again.");
      }
      setConfirmation(data);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatSlotTime(iso: string): string {
    const d = new Date(iso);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function copyIntakeUrl() {
    if (confirmation?.intake_url) {
      navigator.clipboard.writeText(confirmation.intake_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  if (error && !clinicInfo) {
    return (
      <Shell>
        <div className="text-center py-12">
          <svg className="w-10 h-10 mx-auto mb-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: Confirmation
  // ---------------------------------------------------------------------------

  if (step === 3 && confirmation) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} step={3}>
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Appointment Booked!</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">{confirmation.message}</p>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-left space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Date & Time</span>
              <span className="text-[var(--text-primary)] font-medium">{confirmation.appointment_date}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Provider</span>
              <span className="text-[var(--text-primary)] font-medium">{confirmation.provider_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Type</span>
              <span className="text-[var(--text-primary)] font-medium">{confirmation.appointment_type_label}</span>
            </div>
          </div>

          {confirmation.intake_url && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Please complete your intake form before your visit:
              </p>
              <a
                href={confirmation.intake_url}
                className="block w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold text-center hover:brightness-110 transition-all"
              >
                Complete Intake Form
              </a>
              <button
                onClick={copyIntakeUrl}
                className="block w-full py-2 rounded-lg border border-[var(--border-default)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                {copied ? "Copied!" : "Copy Intake Link"}
              </button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: Select Type + Provider
  // ---------------------------------------------------------------------------

  if (step === 0) {
    const canProceed = selectedType && selectedProvider;

    return (
      <Shell clinicName={clinicInfo?.clinic_name} step={0}>
        <div className="space-y-5">
          {/* Appointment Type */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              What type of appointment?
            </label>
            <div className="grid gap-2">
              {clinicInfo?.bookable_types.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedType?.value === type.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedType?.value === type.value
                      ? "bg-[var(--accent)]/10"
                      : "bg-[var(--bg-elevated)]"
                  }`}>
                    <svg
                      className={`w-4.5 h-4.5 ${selectedType?.value === type.value ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[type.value] ?? TYPE_ICONS.comprehensive_exam} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{type.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{type.duration_minutes} minutes</p>
                  </div>
                  {selectedType?.value === type.value && (
                    <svg className="w-5 h-5 text-[var(--accent)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Choose a provider
            </label>
            <div className="grid gap-2">
              {clinicInfo?.providers.map((prov) => (
                <button
                  key={prov.id}
                  onClick={() => setSelectedProvider(prov)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedProvider?.id === prov.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    selectedProvider?.id === prov.id
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                  }`}>
                    {prov.first_name[0]}{prov.last_name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Dr. {prov.first_name} {prov.last_name}
                    </p>
                  </div>
                  {selectedProvider?.id === prov.id && (
                    <svg className="w-5 h-5 text-[var(--accent)] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!canProceed}
            onClick={() => setStep(1)}
            className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            Continue
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: Pick Date + Time
  // ---------------------------------------------------------------------------

  if (step === 1) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} step={1}>
        <div className="space-y-5">
          {/* Summary */}
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-lg px-3 py-2">
            <span className="font-medium text-[var(--text-primary)]">{selectedType?.label}</span>
            <span>with</span>
            <span className="font-medium text-[var(--text-primary)]">Dr. {selectedProvider?.last_name}</span>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Select a date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedSlot(null);
              }}
              min={today}
              max={maxDate}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Available times</label>

              {loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !availability?.slots.length ? (
                <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                  No available times on this date. Please try another day.
                </p>
              ) : (
                <div className="space-y-4">
                  {groupedSlots.morning.length > 0 && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">Morning</p>
                      <div className="grid grid-cols-3 gap-2">
                        {groupedSlots.morning.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2 px-1 rounded-lg text-sm font-medium text-center transition-all ${
                              selectedSlot === slot
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
                            }`}
                          >
                            {formatSlotTime(slot)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {groupedSlots.afternoon.length > 0 && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">Afternoon</p>
                      <div className="grid grid-cols-3 gap-2">
                        {groupedSlots.afternoon.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2 px-1 rounded-lg text-sm font-medium text-center transition-all ${
                              selectedSlot === slot
                                ? "bg-[var(--accent)] text-white"
                                : "border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
                            }`}
                          >
                            {formatSlotTime(slot)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(0)}
              className="flex-1 py-2.5 rounded-lg border border-[var(--border-default)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Back
            </button>
            <button
              disabled={!selectedSlot}
              onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              Continue
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: Patient Info + Confirm
  // ---------------------------------------------------------------------------

  if (step === 2) {
    const canSubmit = Object.keys(validationErrors).length === 0 && !submitting;

    return (
      <Shell clinicName={clinicInfo?.clinic_name} step={2}>
        <div className="space-y-5">
          {/* Appointment summary */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">Type</span>
              <span className="text-[var(--text-primary)] font-medium">{selectedType?.label}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">Provider</span>
              <span className="text-[var(--text-primary)] font-medium">Dr. {selectedProvider?.first_name} {selectedProvider?.last_name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">Date & Time</span>
              <span className="text-[var(--text-primary)] font-medium">
                {selectedDate} at {selectedSlot ? formatSlotTime(selectedSlot) : ""}
              </span>
            </div>
          </div>

          {/* Patient info form */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">First Name *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched("firstName")}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.firstName && validationErrors.firstName ? "border-red-400" : "border-[var(--border-default)]"}`}
                  placeholder="First name"
                />
                {touched.firstName && validationErrors.firstName && <p className="text-xs text-red-400 mt-0.5">{validationErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Last Name *</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => markTouched("lastName")}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.lastName && validationErrors.lastName ? "border-red-400" : "border-[var(--border-default)]"}`}
                  placeholder="Last name"
                />
                {touched.lastName && validationErrors.lastName && <p className="text-xs text-red-400 mt-0.5">{validationErrors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Date of Birth *</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  onBlur={() => markTouched("dob")}
                  max={today}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.dob && validationErrors.dob ? "border-red-400" : "border-[var(--border-default)]"}`}
                />
                {touched.dob && validationErrors.dob && <p className="text-xs text-red-400 mt-0.5">{validationErrors.dob}</p>}
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Sex *</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  onBlur={() => markTouched("sex")}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.sex && validationErrors.sex ? "border-red-400" : "border-[var(--border-default)]"}`}
                >
                  <option value="">Select...</option>
                  {SEX_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {touched.sex && validationErrors.sex && <p className="text-xs text-red-400 mt-0.5">{validationErrors.sex}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => markTouched("phone")}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.phone && validationErrors.phone ? "border-red-400" : "border-[var(--border-default)]"}`}
                  placeholder="(555) 555-5555"
                />
                {touched.phone && validationErrors.phone && <p className="text-xs text-red-400 mt-0.5">{validationErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  className={`w-full px-3 py-2 rounded-lg border bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] ${touched.email && validationErrors.email ? "border-red-400" : "border-[var(--border-default)]"}`}
                  placeholder="email@example.com"
                />
                {touched.email && validationErrors.email && <p className="text-xs text-red-400 mt-0.5">{validationErrors.email}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Reason for Visit</label>
              <textarea
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                placeholder="Briefly describe why you're coming in..."
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => { setStep(1); setError(null); }}
              className="flex-1 py-2.5 rounded-lg border border-[var(--border-default)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Back
            </button>
            <button
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Booking...
                </span>
              ) : (
                "Book Appointment"
              )}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}
