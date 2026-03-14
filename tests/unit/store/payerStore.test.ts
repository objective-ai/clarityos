import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePayerStore } from "@/store/payerStore";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const makePayer = (overrides = {}) => ({
  id: "payer-1",
  name: "VSP Vision",
  payer_id: "VSP001",
  phone: "800-555-0100",
  address: "123 Main St, Sacramento, CA",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeFeeItem = (overrides = {}) => ({
  id: "fee-1",
  payer_id: null,
  cpt_code: "92004",
  description: "Comprehensive new patient eye exam",
  fee: 250.0,
  ...overrides,
});

const makeResponse = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  usePayerStore.setState({ payers: [], feeCatalog: [], loading: false, error: null });
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("payerStore initial state", () => {
  it("has empty payers array", () => {
    expect(usePayerStore.getState().payers).toEqual([]);
  });

  it("has empty feeCatalog array", () => {
    expect(usePayerStore.getState().feeCatalog).toEqual([]);
  });

  it("loading is false", () => {
    expect(usePayerStore.getState().loading).toBe(false);
  });

  it("error is null", () => {
    expect(usePayerStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadPayers
// ---------------------------------------------------------------------------

describe("loadPayers", () => {
  it("fetches and sets payers array on success", async () => {
    const payers = [makePayer(), makePayer({ id: "payer-2", name: "EyeMed" })];
    mockFetch.mockReturnValueOnce(makeResponse(payers));

    await usePayerStore.getState().loadPayers();

    expect(usePayerStore.getState().payers).toEqual(payers);
    expect(usePayerStore.getState().loading).toBe(false);
    expect(usePayerStore.getState().error).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    mockFetch.mockReturnValueOnce(makeResponse({}, 500));

    await usePayerStore.getState().loadPayers();

    expect(usePayerStore.getState().error).toBeTruthy();
    expect(usePayerStore.getState().loading).toBe(false);
  });

  it("sets error on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await usePayerStore.getState().loadPayers();

    expect(usePayerStore.getState().error).toBeTruthy();
    expect(usePayerStore.getState().loading).toBe(false);
  });

  it("calls /api/payers endpoint", async () => {
    mockFetch.mockReturnValueOnce(makeResponse([]));

    await usePayerStore.getState().loadPayers();

    expect(mockFetch).toHaveBeenCalledWith("/api/payers");
  });
});

// ---------------------------------------------------------------------------
// createPayer
// ---------------------------------------------------------------------------

describe("createPayer", () => {
  it("posts and appends new payer to array", async () => {
    const newPayer = makePayer({ id: "payer-new", name: "Davis Vision" });
    mockFetch.mockReturnValueOnce(makeResponse(newPayer));

    const result = await usePayerStore.getState().createPayer({ name: "Davis Vision" });

    expect(result).toEqual(newPayer);
    expect(usePayerStore.getState().payers).toContainEqual(newPayer);
  });

  it("throws on failure", async () => {
    mockFetch.mockReturnValueOnce(makeResponse({}, 400));

    await expect(
      usePayerStore.getState().createPayer({ name: "Test" })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// updatePayer
// ---------------------------------------------------------------------------

describe("updatePayer", () => {
  it("patches and updates payer in place", async () => {
    const original = makePayer();
    const updated = makePayer({ name: "VSP Vision Updated", is_active: false });
    usePayerStore.setState({ payers: [original] });
    mockFetch.mockReturnValueOnce(makeResponse(updated));

    await usePayerStore.getState().updatePayer("payer-1", { name: "VSP Vision Updated", is_active: false });

    const payers = usePayerStore.getState().payers;
    expect(payers[0].name).toBe("VSP Vision Updated");
    expect(payers[0].is_active).toBe(false);
  });

  it("throws on failure", async () => {
    usePayerStore.setState({ payers: [makePayer()] });
    mockFetch.mockReturnValueOnce(makeResponse({}, 404));

    await expect(
      usePayerStore.getState().updatePayer("payer-1", { name: "X" })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadFeeCatalog
// ---------------------------------------------------------------------------

describe("loadFeeCatalog", () => {
  it("fetches and sets feeCatalog array", async () => {
    const items = [makeFeeItem(), makeFeeItem({ id: "fee-2", cpt_code: "92015", description: "Refraction", fee: 45 })];
    mockFetch.mockReturnValueOnce(makeResponse(items));

    await usePayerStore.getState().loadFeeCatalog();

    expect(usePayerStore.getState().feeCatalog).toEqual(items);
    expect(usePayerStore.getState().loading).toBe(false);
  });

  it("calls /api/fee-catalog endpoint", async () => {
    mockFetch.mockReturnValueOnce(makeResponse([]));

    await usePayerStore.getState().loadFeeCatalog();

    expect(mockFetch).toHaveBeenCalledWith("/api/fee-catalog");
  });
});

// ---------------------------------------------------------------------------
// loadPayerFeeSchedule
// ---------------------------------------------------------------------------

describe("loadPayerFeeSchedule", () => {
  it("fetches and returns fee schedule items for a payer", async () => {
    const items = [makeFeeItem({ payer_id: "payer-1", fee: 210 })];
    mockFetch.mockReturnValueOnce(makeResponse(items));

    const result = await usePayerStore.getState().loadPayerFeeSchedule("payer-1");

    expect(result).toEqual(items);
    expect(mockFetch).toHaveBeenCalledWith("/api/payers/payer-1/fee-schedule");
  });

  it("throws on failure", async () => {
    mockFetch.mockReturnValueOnce(makeResponse({}, 500));

    await expect(
      usePayerStore.getState().loadPayerFeeSchedule("payer-1")
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// updatePayerFeeSchedule
// ---------------------------------------------------------------------------

describe("updatePayerFeeSchedule", () => {
  it("puts fee schedule items to correct endpoint", async () => {
    mockFetch.mockReturnValueOnce(makeResponse(undefined, 204));

    await usePayerStore.getState().updatePayerFeeSchedule("payer-1", [
      { cpt_code: "92004", fee: 210 },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/payers/payer-1/fee-schedule",
      expect.objectContaining({ method: "PUT" })
    );
  });
});
