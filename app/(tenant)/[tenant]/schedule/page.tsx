"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { useAppointmentStore } from "@/store/appointmentStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useScheduleActions } from "@/hooks/useScheduleActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api-client";
import { clinicToday, formatDateLong, shiftDate } from "@/lib/timezone";

import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import { BookAppointmentModal } from "@/components/schedule/BookAppointmentModal";
import { CancelModal, RescheduleModal } from "@/components/schedule/ScheduleModals";

const IntakeLinkModal = dynamic(
  () => import("@/components/schedule/IntakeLinkModal"),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false }
);
const TimelineView = dynamic(
  () => import("@/components/schedule/TimelineView"),
  { loading: () => <div className="animate-pulse h-64 bg-white/5 rounded-xl" />, ssr: false }
);
const ClinicView = dynamic(
  () => import("@/components/schedule/ClinicView"),
  { loading: () => <div className="animate-pulse h-64 bg-white/5 rounded-xl" />, ssr: false }
);

import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
} from "@/types/appointment";
import { STATUS_LABELS, STATUS_COLORS } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  return (
    <Suspense>
      <SchedulePageInner />
    </Suspense>
  );
}

function SchedulePageInner() {
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
  } = useAppointmentStore();

  const {
    actionError,
    setActionError,
    intakeLinkData,
    setIntakeLinkData,
    handleCheckIn,
    handleStartExam,
    handleCancel,
    handleRevertCheckIn,
    handleReschedule,
    handleFollowUp,
    handleSendIntake,
    handleMarkNoShow,
    handleBook,
  } = useScheduleActions(tenant);

  // View mode: list | timeline | clinic
  type ViewMode = "list" | "timeline" | "clinic";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("schedule_view") as ViewMode) || "list";
    }
    return "list";
  });
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("schedule_view", mode);
  };

  // Provider filter
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [staffList, setStaffList] = useState<
    { id: string; firstName: string; lastName: string; role: string }[]
  >([]);
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

  // Modal state
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

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  // Auto-open follow-up modal from query params
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
        router.replace(`/${tenant}/schedule`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subtitle
  useEffect(() => {
    const isToday = selectedDate === clinicToday(clinicTimezone);
    setSubtitle(formatDateLong(selectedDate) + (isToday ? " · Today" : ""));
    return () => setSubtitle(null);
  }, [selectedDate, clinicTimezone, setSubtitle]);

  // Follow-up handler — opens booking modal with defaults
  const onFollowUp = (appt: Appointment) => {
    const defaults = handleFollowUp(appt);
    setBookingDefaults(defaults);
    setBookingOpen(true);
  };

  // Entitlement gate
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

  // Status summary counters
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

          <div className="w-px h-5 bg-[var(--border-subtle)]" />

          {/* Date nav */}
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} title="Previous day">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(clinicToday(clinicTimezone))}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} title="Next day">
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
            onClick={() => { setBookingDefaults(undefined); setBookingOpen(true); }}
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

      {/* Appointment views */}
      {loading ? (
        <div className="glass-card flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
              <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="var(--text-muted)" strokeWidth="1.3" />
              <path d="M2 8h16M7 3.5v4M13 3.5v4" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">No appointments</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              No appointments scheduled for this day.
            </p>
          </div>
          <Button variant="outline" onClick={() => { setBookingDefaults(undefined); setBookingOpen(true); }}>
            Book an appointment
          </Button>
        </div>
      ) : viewMode === "timeline" ? (
        <TimelineView
          appointments={appointments}
          selectedDate={selectedDate}
          clinicTimezone={clinicTimezone}
          onCheckIn={handleCheckIn}
          onStartExam={handleStartExam}
          onViewEncounter={(encId) => router.push(`/${tenant}/encounter/${encId}`)}
          onCancel={(id) => setCancelTarget(id)}
          onRevertCheckIn={handleRevertCheckIn}
          onReschedule={(a) => setRescheduleTarget(a)}
          onFollowUp={onFollowUp}
          onSendIntake={handleSendIntake}
          onMarkNoShow={handleMarkNoShow}
          onSlotClick={() => { setBookingDefaults(undefined); setBookingOpen(true); }}
        />
      ) : viewMode === "clinic" ? (
        <ClinicView
          appointments={appointments}
          selectedDate={selectedDate}
          clinicTimezone={clinicTimezone}
          selectedProviderId={selectedProviderId || undefined}
          onCheckIn={handleCheckIn}
          onStartExam={handleStartExam}
          onViewEncounter={(encId) => router.push(`/${tenant}/encounter/${encId}`)}
          onCancel={(id) => setCancelTarget(id)}
          onRevertCheckIn={handleRevertCheckIn}
          onReschedule={(a) => setRescheduleTarget(a)}
          onFollowUp={onFollowUp}
          onSendIntake={handleSendIntake}
          onMarkNoShow={handleMarkNoShow}
          onSlotClick={(_time, providerId) => {
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
              onFollowUp={onFollowUp}
              onViewEncounter={(encId) => router.push(`/${tenant}/encounter/${encId}`)}
              onSendIntake={handleSendIntake}
              onMarkNoShow={handleMarkNoShow}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <BookAppointmentModal
        open={bookingOpen}
        onClose={() => { setBookingOpen(false); setBookingDefaults(undefined); }}
        onSubmit={handleBook}
        defaults={bookingDefaults}
      />
      <CancelModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (reason) => {
          if (cancelTarget) await handleCancel(cancelTarget, reason);
        }}
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
