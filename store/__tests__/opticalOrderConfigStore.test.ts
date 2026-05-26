/**
 * Phase 14 — opticalOrderConfigStore: vitest fake-timer assertions for OPT14-12.
 *
 * Three behaviors:
 *   1. patch* triggers a flush after exactly 1500ms (debounce)
 *   2. flush() called within the debounce window fires PATCH immediately
 *      (flush-on-blur semantics)
 *   3. flush() short-circuits when draft.status != 'draft' (Pitfall 11)
 *
 * Mocks the getAuthHeaders side-effect so the store can construct headers
 * without touching Supabase, and replaces global.fetch per-test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test" })),
}));

import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

function _draftOrder(overrides: Record<string, any> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-000000000000",
    patientId: "00000000-0000-0000-0000-000000000002",
    encounterId: null,
    status: "draft",
    totalPrice: "0.00",
    createdById: "00000000-0000-0000-0000-000000000003",
    placedAt: null,
    dispensedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lineItems: [],
    visionPlan: {},
    fitting: {},
    suggestionResolutions: {},
    finalRefractionId: null,
    habitualRefractionId: null,
    jobTicketGeneratedAt: null,
    ...overrides,
  } as any;
}

describe("opticalOrderConfigStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
    useOpticalOrderConfigStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("debounces patch by 1.5s", async () => {
    const order = _draftOrder();
    useOpticalOrderConfigStore.setState({ draft: order, committed: order });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...order, visionPlan: { name: "VSP" } }),
    } as any);

    useOpticalOrderConfigStore.getState().patchVisionPlan({ name: "VSP" });

    // 1499ms — should NOT have fired yet.
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).not.toHaveBeenCalled();

    // Crossing 1500ms — PATCH fires.
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as any).method).toBe("PATCH");
  });

  it("flushes pending patches on blur", async () => {
    const order = _draftOrder();
    useOpticalOrderConfigStore.setState({ draft: order, committed: order });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...order, fitting: { pd_distance: "63" } }),
    } as any);

    useOpticalOrderConfigStore.getState().patchFitting({ pd_distance: "63" });
    // Simulates blur — calling flush before debounce expires; should
    // clear the timer and PATCH synchronously.
    await useOpticalOrderConfigStore.getState().flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no-ops when status != "draft"', async () => {
    const placed = _draftOrder({ status: "placed" });
    useOpticalOrderConfigStore.setState({
      draft: placed,
      committed: placed,
      dirty: new Set(["vision_plan"]) as any,
    });
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    await useOpticalOrderConfigStore.getState().flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
