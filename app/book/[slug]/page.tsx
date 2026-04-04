"use client";

/**
 * app/book/[slug]/page.tsx
 *
 * Public self-serve booking page — no auth required.
 * 5-step wizard: Visit Type → Provider → Date & Time → Your Info → Confirm
 * Light/white theme using explicit Tailwind classes (bypasses CSS variables).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const STEPS = ["Visit Type", "Provider", "Date & Time", "Your Info", "Confirm"] as const;

const TYPE_ICONS: Record<string, string> = {
  comprehensive_exam:
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  contact_lens_exam:
    "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  pediatric_exam:
    "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
};

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {STEPS.map((label, i) => (
        <div
          key={label}
          title={label}
          className={`h-2 flex-1 rounded-full transition-all duration-300 ${
            i < current
              ? "bg-[var(--accent)]"
              : i === current
              ? "bg-[var(--accent)]/50 ring-2 ring-[var(--accent)] ring-offset-1"
              : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell — page wrapper (light theme)
// ---------------------------------------------------------------------------

function Shell({
  children,
  clinicName,
  currentStep,
  showSteps = true,
}: {
  children: React.ReactNode;
  clinicName?: string;
  currentStep?: number;
  showSteps?: boolean;
}) {
  return (
    <div
      className="min-h-screen bg-gray-50"
      data-theme="public-booking"
    >
      <div className="max-w-lg mx-auto px-4 mt-12 mb-12 sm:px-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[var(--accent)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          {clinicName && (
            <h1 className="text-lg font-semibold text-gray-900">{clinicName}</h1>
          )}
          <p className="text-sm text-gray-500">Book an Appointment</p>
        </div>

        {/* Wizard card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {showSteps && currentStep !== undefined && currentStep < STEPS.length && (
            <StepIndicator current={currentStep} />
          )}
          {children}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Your information is encrypted and protected under HIPAA.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-400 mt-0.5">{message}</p>;
}

// ---------------------------------------------------------------------------
// Booking Week Strip — 7-day availability calendar (light theme)
// ---------------------------------------------------------------------------

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getConsecutiveDays(startDate: string, count: number): string[] {
  const result: string[] = [];
  const d = new Date(startDate + "T12:00:00");
  for (let i = 0; i < count; i++) {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    result.push(
      `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`
    );
  }
  return result;
}

function BookingWeekStrip({
  selectedDate,
  onSelectDay,
  weekStart,
  onShiftWeek,
  slotCounts,
  loadingDays,
  todayStr,
}: {
  selectedDate: string;
  onSelectDay: (date: string) => void;
  weekStart: string;
  onShiftWeek: (direction: -1 | 1) => void;
  /** date → number of available slots. undefined = not fetched. 0 = no availability. */
  slotCounts: Record<string, number>;
  loadingDays: boolean;
  todayStr: string;
}) {
  const days = useMemo(() => getConsecutiveDays(weekStart, 7), [weekStart]);
  const isPastWeek = weekStart <= todayStr;

  return (
    <div className="space-y-2">
      {/* Week navigation header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onShiftWeek(-1)}
          disabled={isPastWeek}
          className={`p-1 rounded-md transition-colors ${
            isPastWeek
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
          aria-label="Previous week"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-xs font-medium text-gray-500">
          {(() => {
            const first = new Date(days[0] + "T12:00:00");
            const last = new Date(days[6] + "T12:00:00");
            if (first.getMonth() === last.getMonth()) {
              return `${MONTH_NAMES_SHORT[first.getMonth()]} ${first.getDate()}–${last.getDate()}`;
            }
            return `${MONTH_NAMES_SHORT[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES_SHORT[last.getMonth()]} ${last.getDate()}`;
          })()}
        </span>
        <button
          onClick={() => onShiftWeek(1)}
          className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Next week"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const dayName = DAY_NAMES_SHORT[d.getDay()];
          const dayNum = d.getDate();
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const count = slotCounts[dateStr];
          const hasSlots = count !== undefined && count > 0;
          const noSlots = count !== undefined && count === 0;
          const isPast = dateStr < todayStr;
          const disabled = isPast || noSlots;

          return (
            <button
              key={dateStr}
              onClick={() => !disabled && onSelectDay(dateStr)}
              disabled={disabled}
              className={`
                flex flex-col items-center py-2 rounded-lg transition-all duration-150
                ${disabled
                  ? "opacity-40 cursor-not-allowed"
                  : isSelected
                  ? "bg-[var(--accent)]/10 border border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/20"
                  : "border border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                }
              `}
            >
              <span className={`text-[10px] font-medium ${
                isSelected ? "text-[var(--accent)]" : isToday ? "text-[var(--accent)]" : "text-gray-400"
              }`}>
                {isToday ? "Today" : dayName}
              </span>
              <span className={`text-sm font-semibold mt-0.5 ${
                isSelected ? "text-[var(--accent)]" : disabled ? "text-gray-300" : "text-gray-800"
              }`}>
                {dayNum}
              </span>
              {loadingDays ? (
                <span className="w-3 h-3 mt-0.5 border border-gray-300 border-t-transparent rounded-full animate-spin" />
              ) : count !== undefined ? (
                <span className={`text-[9px] font-medium mt-0.5 ${
                  hasSlots
                    ? isSelected ? "text-[var(--accent)]" : "text-green-600"
                    : "text-gray-300"
                }`}>
                  {hasSlots ? `${count}` : "—"}
                </span>
              ) : (
                <span className="text-[9px] text-gray-300 mt-0.5">·</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();

  // Clinic data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clinicInfo, setClinicInfo] = useState<BookingClinicInfo | null>(null);

  // Step 1 — Visit Type
  const [selectedType, setSelectedType] = useState<BookableType | null>(null);

  // Step 2 — Provider
  const [selectedProvider, setSelectedProvider] = useState<BookingProvider | null>(null);

  // Step 3 — Date & Time
  const [selectedDate, setSelectedDate] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  // Week strip state
  const [weekStart, setWeekStart] = useState("");
  const [weekSlotCounts, setWeekSlotCounts] = useState<Record<string, number>>({});
  const [loadingWeek, setLoadingWeek] = useState(false);
  const weekFetchRef = useRef(0);

  // Step 4 — Patient Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Step 5 — Confirm / Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);

  // Success state
  const [confirmation, setConfirmation] = useState<PublicBookingResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Wizard step (0-indexed, matching STEPS array)
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
  // Fetch availability when date/provider/type change (Step 3)
  // ---------------------------------------------------------------------------

  const fetchAvailability = useCallback(async () => {
    if (!slug || !selectedDate || !selectedProvider || !selectedType) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setSlotError(null);
    try {
      const qs = new URLSearchParams({
        date: selectedDate,
        provider_id: selectedProvider.id,
        appointment_type: selectedType.value,
      });
      const res = await fetch(
        `/api/public/booking/${slug}/availability?${qs}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail ?? "Failed to load availability");
      }
      const data: AvailabilityResponse = await res.json();
      setAvailability(data);
    } catch (err) {
      setAvailability(null);
      setSlotError(
        err instanceof Error ? err.message : "Failed to load availability"
      );
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, selectedDate, selectedProvider, selectedType]);

  useEffect(() => {
    if (step === 2 && selectedDate) {
      fetchAvailability();
    }
  }, [fetchAvailability, step, selectedDate]);

  // ---------------------------------------------------------------------------
  // Date constraints
  // ---------------------------------------------------------------------------

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Initialize weekStart to today when entering step 3
  useEffect(() => {
    if (step === 2 && !weekStart) {
      setWeekStart(today);
    }
  }, [step, weekStart, today]);

  // Fetch slot counts for all 7 days in the current week
  const fetchWeekAvailability = useCallback(async (startDate: string) => {
    if (!slug || !selectedProvider || !selectedType) return;
    const days = getConsecutiveDays(startDate, 7);
    const fetchId = ++weekFetchRef.current;
    setLoadingWeek(true);

    try {
      const results = await Promise.all(
        days.map(async (date) => {
          if (date < today) return { date, count: 0 };
          try {
            const qs = new URLSearchParams({
              date,
              provider_id: selectedProvider.id,
              appointment_type: selectedType.value,
            });
            const res = await fetch(`/api/public/booking/${slug}/availability?${qs}`);
            if (!res.ok) return { date, count: 0 };
            const data: AvailabilityResponse = await res.json();
            return { date, count: data.slots?.length ?? 0 };
          } catch {
            return { date, count: 0 };
          }
        })
      );

      // Only update if this is still the latest fetch
      if (fetchId !== weekFetchRef.current) return;

      const counts: Record<string, number> = {};
      for (const r of results) counts[r.date] = r.count;
      setWeekSlotCounts((prev) => ({ ...prev, ...counts }));

      // Auto-select first available day if no date selected yet
      if (!selectedDate) {
        const firstAvailable = results.find((r) => r.count > 0);
        if (firstAvailable) setSelectedDate(firstAvailable.date);
      }
    } finally {
      if (fetchId === weekFetchRef.current) setLoadingWeek(false);
    }
  }, [slug, selectedProvider, selectedType, today, selectedDate]);

  // Fetch week availability when weekStart changes or entering step 3
  useEffect(() => {
    if (step === 2 && weekStart) {
      fetchWeekAvailability(weekStart);
    }
  }, [step, weekStart, fetchWeekAvailability]);

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
  // Patient info validation
  // ---------------------------------------------------------------------------

  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "Required";
    if (!lastName.trim()) errs.lastName = "Required";
    if (!phone.trim()) errs.phone = "Required";
    if (phone.trim() && !/^[\d\s()+-]{7,20}$/.test(phone.trim()))
      errs.phone = "Invalid phone number";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = "Invalid email";
    return errs;
  }, [firstName, lastName, phone, email]);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  // ---------------------------------------------------------------------------
  // Submit booking (Step 5)
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!slug || !selectedType || !selectedProvider || !selectedSlot) return;
    setTouched({
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    });
    if (Object.keys(validationErrors).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setSlotTaken(false);

    try {
      const res = await fetch(`/api/public/booking/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob: dob || undefined,
          sex: sex || undefined,
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
        // Detect slot-taken scenario (409 Conflict from backend)
        if (res.status === 409) {
          setSlotTaken(true);
          setSubmitError(
            "This slot is no longer available. Please choose a different time."
          );
        } else {
          throw new Error(
            data?.detail ??
              "Something went wrong. The appointment was not saved — please try again."
          );
        }
        return;
      }
      setConfirmation(data);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. The appointment was not saved — please try again."
      );
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

  function formatDateDisplay(dateStr: string): string {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function copyIntakeUrl() {
    if (confirmation?.intake_url) {
      navigator.clipboard.writeText(confirmation.intake_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <Shell showSteps={false}>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state (clinic not found)
  // ---------------------------------------------------------------------------

  if (error && !clinicInfo) {
    return (
      <Shell showSteps={false}>
        <div className="text-center py-12">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (confirmation) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} showSteps={false}>
        <div className="text-center py-4">
          {/* Green checkmark */}
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            You&apos;re booked!
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Your appointment is confirmed. You&apos;ll receive a reminder closer to
            your visit.
          </p>

          {/* Appointment summary */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-left space-y-3 mb-6">
            {clinicInfo?.clinic_name && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Clinic</span>
                <span className="text-gray-900 font-medium">
                  {clinicInfo.clinic_name}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date & Time</span>
              <span className="text-gray-900 font-medium">
                {confirmation.appointment_date}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Provider</span>
              <span className="text-gray-900 font-medium">
                {confirmation.provider_name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Type</span>
              <span className="text-gray-900 font-medium">
                {confirmation.appointment_type_label}
              </span>
            </div>
          </div>

          {confirmation.intake_url && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
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
                className="block w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
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
  // Step 1: Select Visit Type
  // ---------------------------------------------------------------------------

  if (step === 0) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} currentStep={0}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              What type of visit?
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Select the type of appointment you&apos;d like to book.
            </p>
            <div className="grid gap-2">
              {clinicInfo?.bookable_types.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedType?.value === type.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedType?.value === type.value
                        ? "bg-[var(--accent)]/10"
                        : "bg-gray-100"
                    }`}
                  >
                    <svg
                      className={`w-4 h-4 ${
                        selectedType?.value === type.value
                          ? "text-[var(--accent)]"
                          : "text-gray-400"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={
                          TYPE_ICONS[type.value] ?? TYPE_ICONS.comprehensive_exam
                        }
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {type.label}
                    </p>
                    <p className="text-xs text-gray-400">
                      {type.duration_minutes} minutes
                    </p>
                  </div>
                  {selectedType?.value === type.value && (
                    <svg
                      className="w-5 h-5 text-[var(--accent)] shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!selectedType}
            onClick={() => setStep(1)}
            className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            Next
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: Pick Provider
  // ---------------------------------------------------------------------------

  if (step === 1) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} currentStep={1}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Choose a provider
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Select who you&apos;d like to see for your{" "}
              <span className="font-medium text-gray-700">
                {selectedType?.label}
              </span>
              .
            </p>
            <div className="grid gap-2">
              {clinicInfo?.providers.map((prov) => (
                <button
                  key={prov.id}
                  onClick={() => setSelectedProvider(prov)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedProvider?.id === prov.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                      selectedProvider?.id === prov.id
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {prov.first_name[0]}
                    {prov.last_name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Dr. {prov.first_name} {prov.last_name}
                    </p>
                  </div>
                  {selectedProvider?.id === prov.id && (
                    <svg
                      className="w-5 h-5 text-[var(--accent)] shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(0)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2.5 px-4"
            >
              Back
            </button>
            <button
              disabled={!selectedProvider}
              onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: Date & Time slot
  // ---------------------------------------------------------------------------

  if (step === 2) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} currentStep={2}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Choose a date & time
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {selectedType?.label} with Dr. {selectedProvider?.last_name}
            </p>
          </div>

          {/* Week strip date picker */}
          <BookingWeekStrip
            selectedDate={selectedDate}
            onSelectDay={(date) => {
              setSelectedDate(date);
              setSelectedSlot(null);
              setSlotError(null);
            }}
            weekStart={weekStart || today}
            onShiftWeek={(dir) => {
              const days = getConsecutiveDays(weekStart || today, 7);
              const base = dir === 1 ? days[6] : days[0];
              const d = new Date(base + "T12:00:00");
              d.setDate(d.getDate() + dir);
              const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              // Don't go before today
              if (next < today) return;
              setWeekStart(next);
            }}
            slotCounts={weekSlotCounts}
            loadingDays={loadingWeek}
            todayStr={today}
          />

          {/* Time slots */}
          {selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available times
              </label>

              {loadingSlots ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : slotError ? (
                <p className="text-sm text-red-400 py-4 text-center">
                  {slotError}
                </p>
              ) : !availability?.slots.length ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  This provider has no availability on the selected date.
                </p>
              ) : (
                <div className="space-y-4">
                  {groupedSlots.morning.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider font-medium">
                        Morning
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {groupedSlots.morning.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2 px-1 rounded-md text-sm font-medium text-center transition-all ${
                              selectedSlot === slot
                                ? "bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--accent)]"
                                : "bg-gray-50 hover:bg-[var(--accent)]/10 border border-gray-200 text-gray-700 hover:border-[var(--accent)]/40"
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
                      <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider font-medium">
                        Afternoon
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {groupedSlots.afternoon.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2 px-1 rounded-md text-sm font-medium text-center transition-all ${
                              selectedSlot === slot
                                ? "bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--accent)]"
                                : "bg-gray-50 hover:bg-[var(--accent)]/10 border border-gray-200 text-gray-700 hover:border-[var(--accent)]/40"
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
              onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2.5 px-4"
            >
              Back
            </button>
            <button
              disabled={!selectedSlot}
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: Patient Info
  // ---------------------------------------------------------------------------

  if (step === 3) {
    const hasErrors = Object.keys(validationErrors).length > 0;

    return (
      <Shell clinicName={clinicInfo?.clinic_name} currentStep={3}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Your information
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              We&apos;ll use this to create your appointment record.
            </p>
          </div>

          <div className="space-y-3">
            {/* First + Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched("firstName")}
                  placeholder="First name"
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors ${
                    touched.firstName && validationErrors.firstName
                      ? "border-red-400 focus:border-red-400"
                      : "border-gray-200 focus:border-[var(--accent)]"
                  }`}
                />
                {touched.firstName && (
                  <FieldError message={validationErrors.firstName} />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => markTouched("lastName")}
                  placeholder="Last name"
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors ${
                    touched.lastName && validationErrors.lastName
                      ? "border-red-400 focus:border-red-400"
                      : "border-gray-200 focus:border-[var(--accent)]"
                  }`}
                />
                {touched.lastName && (
                  <FieldError message={validationErrors.lastName} />
                )}
              </div>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Phone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => markTouched("phone")}
                  placeholder="(555) 555-5555"
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors ${
                    touched.phone && validationErrors.phone
                      ? "border-red-400 focus:border-red-400"
                      : "border-gray-200 focus:border-[var(--accent)]"
                  }`}
                />
                {touched.phone && (
                  <FieldError message={validationErrors.phone} />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  placeholder="email@example.com"
                  className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors ${
                    touched.email && validationErrors.email
                      ? "border-red-400 focus:border-red-400"
                      : "border-gray-200 focus:border-[var(--accent)]"
                  }`}
                />
                {touched.email && (
                  <FieldError message={validationErrors.email} />
                )}
              </div>
            </div>

            {/* Date of Birth + Sex */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={today}
                  aria-label="Date of birth"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Sex
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  aria-label="Sex"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors"
                >
                  <option value="">Select...</option>
                  {SEX_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reason for Visit */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Reason for Visit
              </label>
              <textarea
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                rows={2}
                placeholder="Briefly describe why you're coming in..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2.5 px-4"
            >
              Back
            </button>
            <button
              disabled={hasErrors && Object.values(touched).some(Boolean)}
              onClick={() => {
                // Mark all required fields touched to trigger validation display
                setTouched({ firstName: true, lastName: true, phone: true, email: true });
                if (!hasErrors) setStep(4);
              }}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 5: Confirm booking
  // ---------------------------------------------------------------------------

  if (step === 4) {
    return (
      <Shell clinicName={clinicInfo?.clinic_name} currentStep={4}>
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Confirm your booking
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Review your appointment details before confirming.
            </p>
          </div>

          {/* Summary card */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Visit Type</span>
              <span className="text-gray-900 font-medium">
                {selectedType?.label}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Provider</span>
              <span className="text-gray-900 font-medium">
                Dr. {selectedProvider?.first_name} {selectedProvider?.last_name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span className="text-gray-900 font-medium">
                {formatDateDisplay(selectedDate)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Time</span>
              <span className="text-gray-900 font-medium">
                {selectedSlot ? formatSlotTime(selectedSlot) : ""}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Patient</span>
                <span className="text-gray-900 font-medium">
                  {firstName} {lastName}
                </span>
              </div>
              {phone && (
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-500">Phone</span>
                  <span className="text-gray-900 font-medium">{phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Error state */}
          {submitError && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-sm text-red-600">{submitError}</p>
              {slotTaken && (
                <button
                  onClick={() => {
                    setStep(2);
                    setSubmitError(null);
                    setSlotTaken(false);
                    setSelectedSlot(null);
                  }}
                  className="mt-2 text-sm text-red-600 underline hover:text-red-700"
                >
                  Go back to choose a different time
                </button>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => { setStep(3); setSubmitError(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2.5 px-4"
            >
              Back
            </button>
            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Booking...
                </span>
              ) : (
                "Confirm Booking"
              )}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}
