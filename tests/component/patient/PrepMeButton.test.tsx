import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrepMeButton } from "@/components/patient/PrepMeButton";
import { usePatientStore } from "@/store/patientStore";

// Mock apiFetch
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  usePatientStore.setState(
    {
      prepMeSummary: null,
      prepMeLoading: false,
    },
    true,
  );
});

describe("PrepMeButton", () => {
  test("renders Prep Me button", () => {
    render(<PrepMeButton patientId="p1" />);

    expect(screen.getByText("Prep Me")).toBeInTheDocument();
  });

  test("button is disabled during loading", () => {
    usePatientStore.setState({ prepMeLoading: true });

    render(<PrepMeButton patientId="p1" />);

    const button = screen.getByRole("button", { name: /prep me/i });
    expect(button).toBeDisabled();
  });

  test("shows loading spinner when prepMeLoading is true", () => {
    usePatientStore.setState({ prepMeLoading: true });

    const { container } = render(<PrepMeButton patientId="p1" />);

    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  test("displays summary card when summary is available and card is shown", async () => {
    // Pre-populate summary so it appears when card opens
    usePatientStore.setState({
      prepMeSummary: "Patient has stable myopia.",
      prepMeLoading: false,
    });

    // Mock fetchPrepMe to do nothing (summary already loaded)
    const fetchPrepMe = vi.fn();
    usePatientStore.setState({ fetchPrepMe } as never);

    render(<PrepMeButton patientId="p1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /prep me/i }));

    // The summary text should be visible
    expect(screen.getByText("Patient has stable myopia.")).toBeInTheDocument();
    expect(screen.getByText("AI Pre-Visit Summary")).toBeInTheDocument();
  });
});
