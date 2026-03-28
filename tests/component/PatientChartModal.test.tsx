import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PatientChartModal } from "@/components/PatientChartModal";
import { usePatientStore } from "@/store/patientStore";
import {
  makePatientDetail,
  makeEncounterSummary,
} from "../helpers/fixtures/patient";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "sunview" }),
}));

// Mock next/dynamic to render components synchronously in tests
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    let Component: React.ComponentType<unknown> | null = null;
    loader().then((mod) => {
      Component = mod.default;
    });
    return (props: Record<string, unknown>) => {
      if (!Component) return null;
      return <Component {...props} />;
    };
  },
}));

// Mock apiFetch so store actions don't hit network
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

// Mock the heavy child components to keep tests fast and focused
vi.mock("@/components/patient/EncounterTimeline", () => ({
  EncounterTimeline: ({ patientId }: { patientId: string }) => (
    <div data-testid="encounter-timeline">Timeline:{patientId}</div>
  ),
}));
vi.mock("@/components/patient/RxHistoryTable", () => ({
  RxHistoryTable: ({ patientId }: { patientId: string }) => (
    <div data-testid="rx-history">RxHistory:{patientId}</div>
  ),
}));
vi.mock("@/components/patient/ClinicalFlowsheet", () => ({
  ClinicalFlowsheet: ({ patientId }: { patientId: string }) => (
    <div data-testid="clinical-flowsheet">Flowsheet:{patientId}</div>
  ),
}));
vi.mock("@/components/patient/InsuranceTab", () => ({
  InsuranceTab: ({ patientId }: { patientId: string }) => (
    <div data-testid="insurance-tab">Insurance:{patientId}</div>
  ),
}));
vi.mock("@/components/patient/ProblemListCard", () => ({
  ProblemListCard: ({ patientId }: { patientId: string }) => (
    <div data-testid="problem-list">Problems:{patientId}</div>
  ),
}));

const mockOnOpenChange = vi.fn();

beforeEach(() => {
  mockOnOpenChange.mockClear();
  usePatientStore.setState({
    activePatient: null,
    detailLoading: false,
    detailError: null,
    encounters: [],
    encountersLoading: false,
    encountersError: null,
    fetchPatient: vi.fn(),
    fetchEncounters: vi.fn(),
  });
});

describe("PatientChartModal", () => {
  test("shows 'No patient selected' when patientId is null", () => {
    render(
      <PatientChartModal
        patientId={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText("No patient selected")).toBeInTheDocument();
  });

  test("shows loading spinner when patient data is loading", () => {
    usePatientStore.setState({ detailLoading: true });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    // Dialog renders in a portal, so query on document instead of container
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  test("renders patient header with name, chart number, DOB, sex", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({
        id: "pat-1",
        firstName: "Jane",
        lastName: "Doe",
        chartNumber: 10001,
        dob: "1990-05-15",
        sex: "female",
      }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText("Doe, Jane")).toBeInTheDocument();
    expect(screen.getByText("#10001")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
  });

  test("shows Summary tab by default with ProblemListCard", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByTestId("problem-list")).toBeInTheDocument();
  });

  test("shows latest encounter card on Summary tab", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
      encounters: [
        makeEncounterSummary({
          id: "e1",
          encounterDate: "2026-03-15",
          providerName: "Dr. Smith",
          chiefComplaint: "Annual exam",
          diagnosisCount: 2,
          isFinalized: true,
        }),
        makeEncounterSummary({
          id: "e2",
          encounterDate: "2026-02-01",
        }),
      ],
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument();
    expect(screen.getByText(/Annual exam/)).toBeInTheDocument();
  });

  test("shows 'No previous encounters' when encounters list is empty", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
      encounters: [],
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText("No previous encounters")).toBeInTheDocument();
  });

  test("clicking Encounters tab renders EncounterTimeline", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Encounters" }));

    expect(screen.getByTestId("encounter-timeline")).toBeInTheDocument();
  });

  test("clicking Rx History tab renders RxHistoryTable", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Rx History" }));

    expect(screen.getByTestId("rx-history")).toBeInTheDocument();
  });

  test("clicking Flowsheets tab renders ClinicalFlowsheet", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Flowsheets" }));

    expect(screen.getByTestId("clinical-flowsheet")).toBeInTheDocument();
  });

  test("clicking Insurance tab renders InsuranceTab", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Insurance" }));

    expect(screen.getByTestId("insurance-tab")).toBeInTheDocument();
  });

  test("renders 'Open full record' link to patient page", () => {
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const link = screen.getByText(/Open full record/);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/sunview/patients/pat-1"
    );
  });

  test("calls fetchPatient when opened with a different patientId", () => {
    const mockFetchPatient = vi.fn();
    const mockFetchEncounters = vi.fn();
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-OTHER" }),
      fetchPatient: mockFetchPatient,
      fetchEncounters: mockFetchEncounters,
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(mockFetchPatient).toHaveBeenCalledWith("pat-1");
    expect(mockFetchEncounters).toHaveBeenCalledWith("pat-1");
  });

  test("skips fetchPatient when activePatient already matches", () => {
    const mockFetchPatient = vi.fn();
    const mockFetchEncounters = vi.fn();
    usePatientStore.setState({
      activePatient: makePatientDetail({ id: "pat-1" }),
      fetchPatient: mockFetchPatient,
      fetchEncounters: mockFetchEncounters,
    });

    render(
      <PatientChartModal
        patientId="pat-1"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(mockFetchPatient).not.toHaveBeenCalled();
    // Encounters still refresh on every open (data may have changed)
    expect(mockFetchEncounters).toHaveBeenCalledWith("pat-1");
  });
});
