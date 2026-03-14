/**
 * hooks/useScheduleActions.ts
 *
 * Encapsulates all schedule action handlers + error/intake state.
 * Uses dedicated store methods (not generic updateAppointment).
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppointmentStore } from "@/store/appointmentStore";
import { formatDateLong } from "@/lib/timezone";
import type { Appointment, AppointmentType } from "@/types/appointment";

export function useScheduleActions(tenant: string) {
  const router = useRouter();
  const {
    checkInPatient,
    revertCheckIn,
    markNoShow,
    cancelAppointment,
    rescheduleAppointment,
    startExam,
    generateIntakeToken,
    createAppointment,
  } = useAppointmentStore();

  const [actionError, setActionError] = useState<string | null>(null);
  const [intakeLinkData, setIntakeLinkData] = useState<{
    url: string;
    patientName: string;
    appointmentDate: string;
  } | null>(null);

  // Auto-clear error after 5s
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(timer);
  }, [actionError]);

  const handleCheckIn = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await checkInPatient(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Check-in failed");
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
        setActionError(err instanceof Error ? err.message : "Start exam failed");
      }
    },
    [startExam, router, tenant]
  );

  const handleCancel = useCallback(
    async (id: string, reason: string) => {
      setActionError(null);
      try {
        await cancelAppointment(id, reason);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Cancel failed");
      }
    },
    [cancelAppointment]
  );

  const handleRevertCheckIn = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await revertCheckIn(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Undo check-in failed");
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
        setActionError(err instanceof Error ? err.message : "Reschedule failed");
      }
    },
    [rescheduleAppointment]
  );

  const handleFollowUp = useCallback((appt: Appointment) => {
    // Returns booking defaults — the page sets these and opens the modal
    return {
      patientId: appt.patientId,
      providerId: appt.providerId,
      appointmentType: appt.appointmentType,
      patientName: appt.patientName ?? undefined,
    };
  }, []);

  const handleSendIntake = useCallback(
    async (appt: Appointment) => {
      setActionError(null);
      try {
        const result = await generateIntakeToken(appt.id);
        setIntakeLinkData({
          url: result.url,
          patientName: appt.patientName ?? "Patient",
          appointmentDate: formatDateLong(appt.startTime.split("T")[0]),
        });
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to generate intake link"
        );
      }
    },
    [generateIntakeToken]
  );

  const handleMarkNoShow = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await markNoShow(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Mark no-show failed");
      }
    },
    [markNoShow]
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

  return {
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
  };
}
