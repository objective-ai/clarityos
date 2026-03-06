/**
 * tests/helpers/mock-api.ts
 *
 * Centralized apiFetch mock for store tests.
 * Call vi.mock("@/lib/api-client") in each test file,
 * then import apiFetch and cast to vi.Mock.
 */

// This file provides the mock factory for apiFetch.
// Usage in test files:
//
//   vi.mock("@/lib/api-client");
//   import { apiFetch } from "@/lib/api-client";
//   const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;
//
// Then in tests:
//   mockApiFetch.mockResolvedValueOnce({ ... });
