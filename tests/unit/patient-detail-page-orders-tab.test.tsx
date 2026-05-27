import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// 1. Mock references declared FIRST. Vitest hoists `vi.mock(...)` calls above
//    these `const`s, but the factories below are invoked lazily (on first import
//    of the mocked module) and close over these bindings by reference, so the
//    `vi.fn()` initializer runs before any factory needs the value.
const mockHas = vi.fn();

// 2. vi.mock calls — auto-hoisted to the top of the file by vitest's transformer.
//    Override tests/setup.ts global next/navigation mock to add patientId param.
vi.mock("next/navigation", () => ({
  useParams: () => ({ tenant: "sunview", patientId: "p-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/sunview/patients/p-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: () => ({
    has: mockHas,
    requireRole: () => true,
    planName: "Premium",
    role: "owner",
  }),
}));

vi.mock("@/store/patientStore", () => ({
  usePatientStore: (selector: any) =>
    selector({
      activePatient: {
        id: "p-1",
        firstName: "James",
        lastName: "Thornton",
        dob: "1980-01-01",
        sex: "male",
        alerts: [],
        problemList: [],
        insurance: [],
        emergencyContacts: [],
        rxHistory: [],
        encounters: [],
      },
      detailLoading: false,
      detailError: null,
      fetchPatient: vi.fn(),
      clearActivePatient: vi.fn(),
      updatePatient: vi.fn(),
    }),
}));

vi.mock("@/store/sessionStore", () => ({
  useCurrentUser: () => ({ role: "owner", fullName: "Test User", avatarInitials: "TU" }),
}));

// Stub all dynamic-loaded tab bodies so the page renders without them.
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => null;
    return Stub;
  },
}));

// 3. STANDARD top-level import of the page — mocks are guaranteed applied
//    by this point because vi.mock calls are hoisted above this import.
import PatientDetailPage from "@/app/(tenant)/[tenant]/patients/[patientId]/page";

describe("Patient detail page — Orders tab locked affordance", () => {
  beforeEach(() => {
    mockHas.mockReset();
  });

  it("renders Orders tab as locked (opacity-50 + lock icon + tooltip) when RETAIL_POS absent", () => {
    mockHas.mockImplementation((key: string) => key !== "retail_pos");
    render(<PatientDetailPage />);
    const ordersBtn = screen.getByRole("button", { name: /Orders/i });
    expect(ordersBtn).toBeInTheDocument();
    expect(ordersBtn.className).toMatch(/opacity-50/);
    expect(ordersBtn.className).toMatch(/cursor-not-allowed/);
    expect(ordersBtn.getAttribute("title")).toMatch(/Retail POS/i);
    expect(ordersBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("locked Orders tab click does NOT switch activeTab", () => {
    mockHas.mockImplementation((key: string) => key !== "retail_pos");
    render(<PatientDetailPage />);
    const ordersBtn = screen.getByRole("button", { name: /Orders/i });
    fireEvent.click(ordersBtn);
    // Orders tab is NOT marked active (no border-[var(--accent)])
    expect(ordersBtn.className).not.toMatch(/border-\[var\(--accent\)\]/);
  });

  it("renders Orders tab unlocked (no opacity, no lock) when RETAIL_POS present", () => {
    mockHas.mockImplementation(() => true);
    render(<PatientDetailPage />);
    const ordersBtn = screen.getByRole("button", { name: /Orders/i });
    expect(ordersBtn.className).not.toMatch(/opacity-50/);
    expect(ordersBtn.getAttribute("aria-disabled")).toBeNull();
    expect(ordersBtn.getAttribute("title")).toBeNull();
  });
});
