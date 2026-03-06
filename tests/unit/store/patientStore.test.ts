import { describe, test, expect, vi, beforeEach } from "vitest";
import { usePatientStore } from "@/store/patientStore";
import {
  makePatientDetail,
  makePatientListResponse,
  makePatientSummary,
  makeEncounterSummary,
  makeFlowsheetRow,
  makePrepMeResponse,
} from "../../helpers/fixtures/patient";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  usePatientStore.setState(
    {
      patients: [],
      totalPatients: 0,
      listLoading: false,
      listError: null,
      searchQuery: "",
      activePatient: null,
      detailLoading: false,
      detailError: null,
      encounters: [],
      encountersLoading: false,
      flowsheet: [],
      flowsheetLoading: false,
      prepMeSummary: null,
      prepMeLoading: false,
    },
    false,
  );
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// fetchPatients
// ---------------------------------------------------------------------------

describe("fetchPatients", () => {
  test("stores patient list on success", async () => {
    const response = makePatientListResponse([
      makePatientSummary({ id: "p1" }),
      makePatientSummary({ id: "p2" }),
    ]);
    mockApiFetch.mockResolvedValueOnce(response);

    await usePatientStore.getState().fetchPatients();

    const state = usePatientStore.getState();
    expect(state.patients).toHaveLength(2);
    expect(state.totalPatients).toBe(2);
    expect(state.listLoading).toBe(false);
  });

  test("passes search query to API", async () => {
    mockApiFetch.mockResolvedValueOnce(makePatientListResponse());

    await usePatientStore.getState().fetchPatients("jane");

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("search=jane"),
    );
  });

  test("sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    await usePatientStore.getState().fetchPatients();

    const state = usePatientStore.getState();
    expect(state.listError).toBe("Network error");
    expect(state.listLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchPatient (detail)
// ---------------------------------------------------------------------------

describe("fetchPatient", () => {
  test("stores patient detail on success", async () => {
    const detail = makePatientDetail({ id: "p1" });
    mockApiFetch.mockResolvedValueOnce(detail);

    await usePatientStore.getState().fetchPatient("p1");

    expect(usePatientStore.getState().activePatient).toEqual(detail);
    expect(usePatientStore.getState().detailLoading).toBe(false);
  });

  test("sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Not found"));

    await usePatientStore.getState().fetchPatient("p1");

    expect(usePatientStore.getState().detailError).toBe("Not found");
    expect(usePatientStore.getState().detailLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPatient
// ---------------------------------------------------------------------------

describe("createPatient", () => {
  test("creates patient and refreshes list", async () => {
    const detail = makePatientDetail({ id: "p-new" });
    const list = makePatientListResponse();
    mockApiFetch.mockResolvedValueOnce(detail); // POST
    mockApiFetch.mockResolvedValueOnce(list); // GET refresh

    const result = await usePatientStore.getState().createPatient({
      firstName: "John",
      lastName: "Smith",
      dob: "1985-01-01",
      sex: "male",
    });

    expect(result.id).toBe("p-new");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// updatePatient
// ---------------------------------------------------------------------------

describe("updatePatient", () => {
  test("updates activePatient in state", async () => {
    const updated = makePatientDetail({ id: "p1", firstName: "Janet" });
    mockApiFetch.mockResolvedValueOnce(updated);

    await usePatientStore.getState().updatePatient("p1", { firstName: "Janet" });

    expect(usePatientStore.getState().activePatient!.firstName).toBe("Janet");
  });
});

// ---------------------------------------------------------------------------
// deletePatient
// ---------------------------------------------------------------------------

describe("deletePatient", () => {
  test("clears activePatient and refreshes list", async () => {
    usePatientStore.setState({ activePatient: makePatientDetail() });
    mockApiFetch.mockResolvedValueOnce(undefined); // DELETE
    mockApiFetch.mockResolvedValueOnce(makePatientListResponse([])); // refresh

    await usePatientStore.getState().deletePatient("p1");

    expect(usePatientStore.getState().activePatient).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// fetchEncounters
// ---------------------------------------------------------------------------

describe("fetchEncounters", () => {
  test("stores encounters on success", async () => {
    const encounters = [makeEncounterSummary()];
    mockApiFetch.mockResolvedValueOnce(encounters);

    await usePatientStore.getState().fetchEncounters("p1");

    expect(usePatientStore.getState().encounters).toHaveLength(1);
    expect(usePatientStore.getState().encountersLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchFlowsheet
// ---------------------------------------------------------------------------

describe("fetchFlowsheet", () => {
  test("stores flowsheet on success", async () => {
    const rows = [makeFlowsheetRow(), makeFlowsheetRow({ encounterId: "enc-2" })];
    mockApiFetch.mockResolvedValueOnce(rows);

    await usePatientStore.getState().fetchFlowsheet("p1");

    expect(usePatientStore.getState().flowsheet).toHaveLength(2);
    expect(usePatientStore.getState().flowsheetLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchPrepMe
// ---------------------------------------------------------------------------

describe("fetchPrepMe", () => {
  test("stores prep me summary on success", async () => {
    const response = makePrepMeResponse();
    mockApiFetch.mockResolvedValueOnce(response);

    await usePatientStore.getState().fetchPrepMe("p1");

    expect(usePatientStore.getState().prepMeSummary).toBe(response.summary);
    expect(usePatientStore.getState().prepMeLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearPrepMe / clearActivePatient
// ---------------------------------------------------------------------------

describe("clearPrepMe", () => {
  test("resets summary to null", () => {
    usePatientStore.setState({ prepMeSummary: "Some summary" });
    usePatientStore.getState().clearPrepMe();
    expect(usePatientStore.getState().prepMeSummary).toBeNull();
  });
});

describe("clearActivePatient", () => {
  test("resets all detail state", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail(),
      encounters: [makeEncounterSummary()],
      flowsheet: [makeFlowsheetRow()],
      prepMeSummary: "Some summary",
    });

    usePatientStore.getState().clearActivePatient();

    const state = usePatientStore.getState();
    expect(state.activePatient).toBeNull();
    expect(state.encounters).toEqual([]);
    expect(state.flowsheet).toEqual([]);
    expect(state.prepMeSummary).toBeNull();
  });
});
