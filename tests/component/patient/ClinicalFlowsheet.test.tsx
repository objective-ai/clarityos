import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClinicalFlowsheet } from "@/components/patient/ClinicalFlowsheet";
import { usePatientStore } from "@/store/patientStore";
import { makeFlowsheetRow } from "../../helpers/fixtures/patient";

// Mock apiFetch (required by store)
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  usePatientStore.setState({
    flowsheet: [],
    flowsheetLoading: false,
    fetchFlowsheet: vi.fn(),
  });
});

describe("ClinicalFlowsheet", () => {
  test("renders loading spinner when flowsheetLoading is true", () => {
    usePatientStore.setState({ flowsheetLoading: true });

    const { container } = render(<ClinicalFlowsheet patientId="p1" />);

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  test("renders empty state when flowsheet is empty", () => {
    usePatientStore.setState({ flowsheet: [] });

    render(<ClinicalFlowsheet patientId="p1" />);

    expect(screen.getByText("No clinical data to display")).toBeInTheDocument();
  });

  test("renders table with correct column headers", () => {
    usePatientStore.setState({
      flowsheet: [makeFlowsheetRow()],
    });

    render(<ClinicalFlowsheet patientId="p1" />);

    expect(screen.getByText("IOP OD")).toBeInTheDocument();
    expect(screen.getByText("IOP OS")).toBeInTheDocument();
    expect(screen.getByText("Sph OD")).toBeInTheDocument();
    expect(screen.getByText("Sph OS")).toBeInTheDocument();
    expect(screen.getByText("Cyl OD")).toBeInTheDocument();
    expect(screen.getByText("Cyl OS")).toBeInTheDocument();
  });

  test("renders IOP values correctly", () => {
    usePatientStore.setState({
      flowsheet: [makeFlowsheetRow({ iopOd: 16, iopOs: 18 })],
    });

    render(<ClinicalFlowsheet patientId="p1" />);

    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  test("highlights elevated IOP > 21 with red styling", () => {
    usePatientStore.setState({
      flowsheet: [makeFlowsheetRow({ iopOd: 25, iopOs: 14 })],
    });

    const { container } = render(<ClinicalFlowsheet patientId="p1" />);

    // Find the cell containing "25" and check it has the red class
    const cells = container.querySelectorAll("td");
    const iopOdCell = Array.from(cells).find(
      (cell) => cell.textContent === "25",
    );
    expect(iopOdCell).toBeTruthy();
    expect(iopOdCell!.className).toContain("text-red-500");
  });

  test("highlights elevated IOP > 18 with amber styling", () => {
    usePatientStore.setState({
      flowsheet: [makeFlowsheetRow({ iopOd: 20, iopOs: 14 })],
    });

    const { container } = render(<ClinicalFlowsheet patientId="p1" />);

    const cells = container.querySelectorAll("td");
    const iopOdCell = Array.from(cells).find(
      (cell) => cell.textContent === "20",
    );
    expect(iopOdCell).toBeTruthy();
    expect(iopOdCell!.className).toContain("text-amber-500");
  });

  test("shows -- for null values", () => {
    usePatientStore.setState({
      flowsheet: [makeFlowsheetRow({ iopOd: null, sphereOd: null })],
    });

    render(<ClinicalFlowsheet patientId="p1" />);

    // Multiple "--" cells should exist
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
