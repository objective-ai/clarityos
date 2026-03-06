import { describe, test, expect, vi, beforeEach } from "vitest";
import { useAppointmentStore } from "@/store/appointmentStore";
import {
  makeAppointment,
  makeAppointmentListResponse,
  makeStartExamResponse,
} from "../../helpers/fixtures/appointment";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useAppointmentStore.setState(
    {
      appointments: [],
      total: 0,
      selectedDate: "2026-03-10",
      loading: false,
      error: null,
    },
    false,
  );
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// fetchAppointments
// ---------------------------------------------------------------------------

describe("fetchAppointments", () => {
  test("stores fetched appointments", async () => {
    const response = makeAppointmentListResponse([
      makeAppointment({ id: "a1" }),
      makeAppointment({ id: "a2" }),
    ]);
    mockApiFetch.mockResolvedValueOnce(response);

    await useAppointmentStore.getState().fetchAppointments("2026-03-10");

    const state = useAppointmentStore.getState();
    expect(state.appointments).toHaveLength(2);
    expect(state.total).toBe(2);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  test("sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Server error"));

    await useAppointmentStore.getState().fetchAppointments("2026-03-10");

    const state = useAppointmentStore.getState();
    expect(state.error).toBe("Server error");
    expect(state.loading).toBe(false);
  });

  test("passes provider_id to API query", async () => {
    mockApiFetch.mockResolvedValueOnce(makeAppointmentListResponse());

    await useAppointmentStore.getState().fetchAppointments("2026-03-10", "prov-1");

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("provider_id=prov-1"),
    );
  });
});

// ---------------------------------------------------------------------------
// createAppointment
// ---------------------------------------------------------------------------

describe("createAppointment", () => {
  test("creates appointment and refreshes list", async () => {
    const newAppt = makeAppointment({ id: "a-new" });
    const refreshed = makeAppointmentListResponse([newAppt]);
    mockApiFetch.mockResolvedValueOnce(newAppt); // POST
    mockApiFetch.mockResolvedValueOnce(refreshed); // GET refresh

    const result = await useAppointmentStore.getState().createAppointment({
      patientId: "pat-1",
      providerId: "prov-1",
      appointmentType: "comprehensive_exam",
      startTime: "2026-03-10T09:00:00Z",
    });

    expect(result.id).toBe("a-new");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// updateAppointment
// ---------------------------------------------------------------------------

describe("updateAppointment", () => {
  test("updates appointment in local state", async () => {
    const original = makeAppointment({ id: "a1", chiefComplaint: "Old" });
    useAppointmentStore.setState({ appointments: [original] });

    const updated = makeAppointment({ id: "a1", chiefComplaint: "Updated" });
    mockApiFetch.mockResolvedValueOnce(updated);

    const result = await useAppointmentStore
      .getState()
      .updateAppointment("a1", { chiefComplaint: "Updated" });

    expect(result.chiefComplaint).toBe("Updated");
    const state = useAppointmentStore.getState();
    expect(state.appointments[0].chiefComplaint).toBe("Updated");
  });
});

// ---------------------------------------------------------------------------
// cancelAppointment
// ---------------------------------------------------------------------------

describe("cancelAppointment", () => {
  test("cancels and refreshes list", async () => {
    mockApiFetch.mockResolvedValueOnce(undefined); // POST cancel
    mockApiFetch.mockResolvedValueOnce(makeAppointmentListResponse([])); // refresh

    await useAppointmentStore.getState().cancelAppointment("a1", "Patient request");

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/appointments/a1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

// ---------------------------------------------------------------------------
// checkInPatient
// ---------------------------------------------------------------------------

describe("checkInPatient", () => {
  test("checks in and updates local state", async () => {
    const original = makeAppointment({ id: "a1", status: "scheduled" });
    useAppointmentStore.setState({ appointments: [original] });

    const updated = makeAppointment({ id: "a1", status: "arrived" });
    mockApiFetch.mockResolvedValueOnce(updated);

    const result = await useAppointmentStore.getState().checkInPatient("a1");

    expect(result.status).toBe("arrived");
    expect(useAppointmentStore.getState().appointments[0].status).toBe("arrived");
  });
});

// ---------------------------------------------------------------------------
// startExam
// ---------------------------------------------------------------------------

describe("startExam", () => {
  test("starts exam and refreshes list", async () => {
    const examResponse = makeStartExamResponse();
    mockApiFetch.mockResolvedValueOnce(examResponse); // POST start-exam
    mockApiFetch.mockResolvedValueOnce(makeAppointmentListResponse()); // refresh

    const result = await useAppointmentStore.getState().startExam("a1");

    expect(result.encounterId).toBe("enc-1");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// setSelectedDate
// ---------------------------------------------------------------------------

describe("setSelectedDate", () => {
  test("updates selectedDate", () => {
    useAppointmentStore.getState().setSelectedDate("2026-04-01");
    expect(useAppointmentStore.getState().selectedDate).toBe("2026-04-01");
  });
});
