import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ tenantId: "demo-clinic" }),
  usePathname: () => "/demo-clinic/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase client (used by apiFetch -> getAuthHeaders)
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { access_token: "mock-token-for-tests" },
        },
      }),
    },
  }),
}));
