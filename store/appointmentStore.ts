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
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;

  // ---- Actions ----
  setSelectedDate: (date: string) => void;
  fetchAppointments: (date: string, providerId?: string) => Promise<void>;
  createAppointment: (payload: AppointmentCreatePayload) => Promise<Appointment>;
  updateAppointment: (id: string, payload: AppointmentUpdatePayload) => Promise<Appointment>;
  cancelAppointment: (id: string, reason: string) => Promise<void>;
  checkInPatient: (id: string) => Promise<Appointment>;
  startExam: (id: string) => Promise<StartExamResponse>;
}

/** Get today's date as ISO string (YYYY-MM-DD) */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAppointmentStore = create<AppointmentState>()(
  devtools(
    (set, get) => ({
      appointments: [],
      total: 0,
      selectedDate: todayISO(),
      loading: false,
      error: null,

      setSelectedDate: (date) => {
        set({ selectedDate: date });
      },

      fetchAppointments: async (date, providerId) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ date });
          if (providerId) params.set("provider_id", providerId);

          const data = await apiFetch<AppointmentListResponse>(
            `/api/appointments?${params.toString()}`
          );
          set({ appointments: data.items, total: data.total, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to load appointments",
            loading: false,
          });
        }
      },

      createAppointment: async (payload) => {
        const appt = await apiFetch<Appointment>("/api/appointments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // Refresh the list for the current date
        const { selectedDate } = get();
        await get().fetchAppointments(selectedDate);
        return appt;
      },

      updateAppointment: async (id, payload) => {
        const appt = await apiFetch<Appointment>(`/api/appointments/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        // Optimistic update in local state
        set((state) => ({
          appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
        }));
        return appt;
      },

      cancelAppointment: async (id, reason) => {
        await apiFetch(`/api/appointments/${id}/cancel`, {
          method: "POST",
          body: JSON.stringify({ cancellationReason: reason }),
        });
        // Refresh the list
        const { selectedDate } = get();
        await get().fetchAppointments(selectedDate);
      },

      checkInPatient: async (id) => {
        const appt = await apiFetch<Appointment>(`/api/appointments/${id}/check-in`, {
          method: "POST",
        });
        set((state) => ({
          appointments: state.appointments.map((a) => (a.id === id ? appt : a)),
        }));
        return appt;
      },

      startExam: async (id) => {
        const result = await apiFetch<StartExamResponse>(
          `/api/appointments/${id}/start-exam`,
          { method: "POST" }
        );
        // Refresh to get updated status
        const { selectedDate } = get();
        await get().fetchAppointments(selectedDate);
        return result;
      },
    }),
    { name: "appointmentStore" }
  )
);
