/**
 * store/appointmentStore.ts
 *
 * Zustand store for appointment data. Fetches from BFF proxy routes
 * (/api/appointments) which forward to FastAPI.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { apiFetch } from "@/lib/api-client";
import type {
  Appointment,
  AppointmentCreatePayload,
  AppointmentListResponse,
  AppointmentUpdatePayload,
  StartExamResponse,
} from "@/types/appointment";

interface AppointmentState {
  /** Appointments for the currently selected date */
  appointments: Appointment[];
  /** Total count from the API */
  total: number;
  /** Currently selected date (ISO date string, e.g. "2026-03-10") */
  selectedDate: string;
  /** Clinic IANA timezone from tenant settings (e.g. "America/Los_Angeles") */
  clinicTimezone: string;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;

  /** Appointments for a full week (used by WeekView) */
  weekAppointments: Appointment[];
  /** Loading state for week fetch */
  isLoadingWeek: boolean;

  // ---- Actions ----
  setSelectedDate: (date: string) => void;
  fetchAppointments: (date: string, providerId?: string) => Promise<void>;
  fetchWeekAppointments: (startDate: string, endDate: string) => Promise<void>;
  createAppointment: (payload: AppointmentCreatePayload) => Promise<Appointment>;
  updateAppointment: (id: string, payload: AppointmentUpdatePayload) => Promise<Appointment>;
  cancelAppointment: (id: string, reason: string) => Promise<void>;
  markNoShow: (id: string) => Promise<Appointment>;
  checkInPatient: (id: string) => Promise<Appointment>;
  revertCheckIn: (id: string) => Promise<Appointment>;
  startExam: (id: string) => Promise<StartExamResponse>;
  rescheduleAppointment: (id: string, newStartTime: string, newDurationMinutes?: number) => Promise<Appointment>;
  generateIntakeToken: (id: string) => Promise<{ token: string; url: string; expiresAt: string }>;
}

/** Get a local date as ISO string (YYYY-MM-DD). Avoids UTC offset bugs. */
export function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useAppointmentStore = create<AppointmentState>()(
  devtools(
    (set, get) => ({
      appointments: [],
      total: 0,
      selectedDate: localDateISO(),
      clinicTimezone: "America/Los_Angeles",
      loading: false,
      error: null,
      weekAppointments: [],
      isLoadingWeek: false,

      setSelectedDate: (date) => {
        set({ selectedDate: date });
      },

      fetchWeekAppointments: async (startDate, endDate) => {
        set({ isLoadingWeek: true });
        try {
          const data = await apiFetch<AppointmentListResponse>(
            `/api/appointments?date_from=${startDate}&date_to=${endDate}`
          );
          set({ weekAppointments: data.items, isLoadingWeek: false });
        } catch (err) {
          set({ isLoadingWeek: false });
        }
      },

      fetchAppointments: async (date, providerId) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ date });
          if (providerId) params.set("provider_id", providerId);

          const data = await apiFetch<AppointmentListResponse>(
            `/api/appointments?${params.toString()}`
          );
          set({
            appointments: data.items,
            total: data.total,
            clinicTimezone: data.timezone || "America/Los_Angeles",
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to load appointments",
            loading: false,
          });
        }
      },

      createAppointment: async (payload) => {
        set({ error: null });
        try {
          const appt = await apiFetch<Appointment>("/api/appointments", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          // Refresh the list for the current date
          const { selectedDate } = get();
          await get().fetchAppointments(selectedDate);
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to create appointment";
          set({ error: errorMsg });
          throw err;
        }
      },

      updateAppointment: async (id, payload) => {
        set({ error: null });
        try {
          const appt = await apiFetch<Appointment>(`/api/appointments/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          // Optimistic update in local state
          set((state) => ({
            appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
          }));
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to update appointment";
          set({ error: errorMsg });
          throw err;
        }
      },

      cancelAppointment: async (id, reason) => {
        set({ error: null });
        try {
          await apiFetch(`/api/appointments/${id}/cancel`, {
            method: "POST",
            body: JSON.stringify({ cancellationReason: reason }),
          });
          // Refresh the list
          const { selectedDate } = get();
          await get().fetchAppointments(selectedDate);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to cancel appointment";
          set({ error: errorMsg });
          throw err;
        }
      },

      markNoShow: async (id) => {
        set({ error: null });
        try {
          const appt = await apiFetch<Appointment>(`/api/appointments/${id}/no-show`, {
            method: "POST",
          });
          set((state) => ({
            appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
          }));
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to mark appointment as no-show";
          set({ error: errorMsg });
          throw err;
        }
      },

      checkInPatient: async (id) => {
        set({ error: null });
        try {
          const appt = await apiFetch<Appointment>(`/api/appointments/${id}/check-in`, {
            method: "POST",
          });
          set((state) => ({
            appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
          }));
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to check in patient";
          set({ error: errorMsg });
          throw err;
        }
      },

      revertCheckIn: async (id) => {
        set({ error: null });
        try {
          const appt = await apiFetch<Appointment>(`/api/appointments/${id}/revert-check-in`, {
            method: "POST",
          });
          set((state) => ({
            appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
          }));
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to revert check-in";
          set({ error: errorMsg });
          throw err;
        }
      },

      startExam: async (id) => {
        set({ error: null });
        try {
          const result = await apiFetch<StartExamResponse>(
            `/api/appointments/${id}/start-exam`,
            { method: "POST" }
          );
          // Refresh to get updated status
          const { selectedDate } = get();
          await get().fetchAppointments(selectedDate);
          return result;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to start exam";
          set({ error: errorMsg });
          throw err;
        }
      },

      rescheduleAppointment: async (id, newStartTime, newDurationMinutes) => {
        set({ error: null });
        try {
          const payload: Record<string, unknown> = { newStartTime };
          if (newDurationMinutes != null) payload.newDurationMinutes = newDurationMinutes;
          const appt = await apiFetch<Appointment>(`/api/appointments/${id}/reschedule`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          const { selectedDate } = get();
          await get().fetchAppointments(selectedDate);
          return appt;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to reschedule appointment";
          set({ error: errorMsg });
          throw err;
        }
      },

      generateIntakeToken: async (id) => {
        set({ error: null });
        try {
          const result = await apiFetch<{ token: string; url: string; expiresAt: string }>(
            `/api/appointments/${id}/intake-token`,
            { method: "POST" }
          );
          // Update local appointment with pending intake status
          set((state) => ({
            appointments: state.appointments.map((a) =>
              a.id === id ? { ...a, intakeStatus: "pending" as const } : a
            ),
          }));
          return result;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Failed to generate intake token";
          set({ error: errorMsg });
          throw err;
        }
      },
    }),
    { name: "appointmentStore" }
  )
);
