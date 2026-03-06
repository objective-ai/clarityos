import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EncounterTimeline } from "@/components/patient/EncounterTimeline";
import { usePatientStore } from "@/store/patientStore";
import { makeEncounterSummary } from "../../helpers/fixtures/patient";

// Mock apiFetch
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  usePatientStore.setState({
    encounters: [],
    encountersLoading: false,
    fetchEncounters: vi.fn(),
  });
});

describe("EncounterTimeline", () => {
  test("renders loading spinner when encountersLoading is true", () => {
    usePatientStore.setState({ encountersLoading: true });

    const { container } = render(<EncounterTimeline patientId="p1" />);

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  test("renders empty state when no encounters", () => {
    usePatientStore.setState({ encounters: [] });

    render(<EncounterTimeline patientId="p1" />);

    expect(screen.getByText("No encounters on file")).toBeInTheDocument();
  });

  test("renders encounters with dates and badges", () => {
    usePatientStore.setState({
      encounters: [
        makeEncounterSummary({
          id: "e1",
          encounterDate: "2026-03-01",
          isFinalized: true,
          diagnosisCount: 2,
        }),
        makeEncounterSummary({
          id: "e2",
          encounterDate: "2026-02-15",
          isFinalized: false,
          diagnosisCount: 0,
        }),
      ],
    });

    render(<EncounterTimeline patientId="p1" />);

    // Check finalization badges
    expect(screen.getByText("Finalized")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();

    // Check diagnosis count badge
    expect(screen.getByText("2 Dx")).toBeInTheDocument();
  });

  test("renders chief complaint and provider name", () => {
    usePatientStore.setState({
      encounters: [
        makeEncounterSummary({
          chiefComplaint: "Blurred vision",
          providerName: "Dr. Smith",
        }),
      ],
    });

    render(<EncounterTimeline patientId="p1" />);

    expect(screen.getByText(/Blurred vision/)).toBeInTheDocument();
    expect(screen.getByText(/Dr. Smith/)).toBeInTheDocument();
  });
});
