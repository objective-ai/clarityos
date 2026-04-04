"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import { getRoleDefaultView } from "@/lib/scheduleUtils";
import type { ViewMode, DrawerState } from "@/types/schedule";
import { VALID_VIEW_MODES, VIEW_MODE_LABELS } from "@/types/schedule";

import { AppointmentCard } from "@/components/schedule/AppointmentCard";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { BookingDrawer } from "@/components/schedule/BookingDrawer";
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
  } = useScheduleActions(tenant);

  const { role } = useEntitlements();

  // View mode: list | timeline | clinic | flow | week
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("schedule_view") as ViewMode;
      if (stored && VALID_VIEW_MODES.includes(stored)) return stored;
    }
    return getRoleDefaultView(role ?? "");
  });
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("schedule_view", mode);
  };

  // Drawer state machine: closed | detail | booking
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });

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

  // Booking state helpers
  const openBooking = (defaults?: { patientId?: string; providerId?: string; appointmentType?: AppointmentType; patientName?: string; providerName?: string }) => {
    setDrawer({ mode: "booking", defaults });
  };
  // Cancel / reschedule modals
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);

  // Counts by date for WeekStrip
  const countsByDate = useMemo(() => {
    return { [selectedDate]: appointments.length };
  }, [selectedDate, appointments.length]);

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  // Auto-open follow-up modal from query params
  useEffect(() => {
    if (searchParams.get("followUp") === "true") {
      const pid = searchParams.get("patientId");
      const provId = searchParams.get("providerId");
      if (pid && provId) {
        openBooking({
          patientId: pid,
          providerId: provId,
          patientName: searchParams.get("patientName") || undefined,
          providerName: searchParams.get("providerName") || undefined,
        });
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

  // Follow-up handler — opens booking drawer with defaults
  const onFollowUp = (appt: Appointment) => {
    const defaults = handleFollowUp(appt);
    openBooking(defaults);
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
      {/* Week strip navigation */}
      <WeekStrip
        selectedDate={selectedDate}
        countsByDate={countsByDate}
        onSelectDay={setSelectedDate}
        onShiftWeek={(dir) => setSelectedDate(shiftDate(selectedDate, dir * 7))}
        clinicTimezone={clinicTimezone}
      />

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

        {/* Right — provider filter, view toggle, book */}
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

          {/* View toggle — 5 modes */}
          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            {VALID_VIEW_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewChange(mode)}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 ${
                  viewMode === mode
                    ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {VIEW_MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-[var(--border-subtle)]" />

          <Button
            size="sm"
            onClick={() => openBooking()}
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
          <Button variant="outline" onClick={() => openBooking()}>
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
          onSlotClick={() => openBooking()}
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
            openBooking(providerId ? { providerId } : undefined);
          }}
        />
      ) : viewMode === "flow" ? (
        <div className="glass-card flex items-center justify-center py-20 text-[var(--text-muted)]">
          Flow Board — coming in Plan 05
        </div>
      ) : viewMode === "week" ? (
        <div className="glass-card flex items-center justify-center py-20 text-[var(--text-muted)]">
          Week View — coming in Plan 05
        </div>
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

      {/* Booking drawer */}
      <BookingDrawer
        open={drawer.mode === "booking"}
        onClose={() => setDrawer({ mode: "closed" })}
        allAppointments={appointments}
        staffList={staffList.map((s) => ({
          id: s.id,
          full_name:
            s.role === "doctor" || s.role === "owner"
              ? `Dr. ${s.firstName} ${s.lastName}`
              : `${s.firstName} ${s.lastName} (${s.role})`,
        }))}
        tenant={tenant}
        timezone={clinicTimezone}
        defaults={drawer.mode === "booking" ? drawer.defaults : undefined}
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
