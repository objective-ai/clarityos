import { describe, test, expect, vi, beforeEach } from "vitest";
import { useBillingStore } from "@/store/billingStore";
import {
  makeSuperbill,
  makeLineItem,
  makeMdmResult,
} from "../../helpers/fixtures/billing";

// Mock apiFetch at module level
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Reset store state
  useBillingStore.setState({ encounters: {} });
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// loadSuperbill
// ---------------------------------------------------------------------------

describe("loadSuperbill", () => {
  test("sets superbill on successful fetch", async () => {
    const superbill = makeSuperbill();
    mockApiFetch.mockResolvedValueOnce(superbill);

    await useBillingStore.getState().loadSuperbill("enc-1");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill).toEqual(superbill);
    expect(slice.loadStatus).toBe("loaded");
    expect(slice.error).toBeNull();
  });

  test("handles 204 (no superbill yet) gracefully", async () => {
    // Backend returns 204 for missing superbill; apiFetch converts 204 → null
    mockApiFetch.mockResolvedValueOnce(null);

    await useBillingStore.getState().loadSuperbill("enc-1");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill).toBeNull();
    expect(slice.loadStatus).toBe("loaded");
    expect(slice.error).toBeNull();
  });

  test("sets error on non-404 failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    await useBillingStore.getState().loadSuperbill("enc-1");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.loadStatus).toBe("error");
    expect(slice.error).toBe("Network error");
  });

  test("does not re-fetch when already loading", async () => {
    // Set loading state
    useBillingStore.setState({
      encounters: {
        "enc-1": {
          superbill: null,
          loadStatus: "loading",
          error: null,
          mdm: null,
          warnings: [],
          isSaving: false,
        },
      },
    });

    await useBillingStore.getState().loadSuperbill("enc-1");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test("extracts MDM from superbill when mdmLevel exists", async () => {
    const superbill = makeSuperbill({
      mdmLevel: "moderate",
      suggestedEmCode: "99214",
      mdmReasoning: "2-of-3 met",
    });
    mockApiFetch.mockResolvedValueOnce(superbill);

    await useBillingStore.getState().loadSuperbill("enc-1");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.mdm).toBeTruthy();
    expect(slice.mdm!.mdmLevel).toBe("moderate");
  });
});

// ---------------------------------------------------------------------------
// createSuperbill
// ---------------------------------------------------------------------------

describe("createSuperbill", () => {
  test("creates superbill and stores result", async () => {
    const superbill = makeSuperbill();
    mockApiFetch.mockResolvedValueOnce(superbill);

    const result = await useBillingStore.getState().createSuperbill("enc-1");

    expect(result).toEqual(superbill);
    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill).toEqual(superbill);
    expect(slice.isSaving).toBe(false);
  });

  test("returns null and sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Create failed"));

    const result = await useBillingStore.getState().createSuperbill("enc-1");

    expect(result).toBeNull();
    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.error).toBe("Create failed");
  });
});

// ---------------------------------------------------------------------------
// updateStatus
// ---------------------------------------------------------------------------

describe("updateStatus", () => {
  test("updates superbill status", async () => {
    const original = makeSuperbill({ claimStatus: "draft" });
    const updated = makeSuperbill({ claimStatus: "ready_to_bill" });
    useBillingStore.setState({
      encounters: {
        "enc-1": {
          superbill: original,
          loadStatus: "loaded",
          error: null,
          mdm: null,
          warnings: [],
          isSaving: false,
        },
      },
    });
    mockApiFetch.mockResolvedValueOnce(updated);

    await useBillingStore.getState().updateStatus("enc-1", "ready_to_bill");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill!.claimStatus).toBe("ready_to_bill");
    expect(slice.isSaving).toBe(false);
  });

  test("no-ops when superbill is null", async () => {
    await useBillingStore.getState().updateStatus("enc-1", "ready_to_bill");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addLineItem
// ---------------------------------------------------------------------------

describe("addLineItem", () => {
  test("adds line item and recalculates totalFee", async () => {
    const existing = makeLineItem({ fee: 175, units: 1 });
    const superbill = makeSuperbill({ lineItems: [existing], totalFee: 175 });
    useBillingStore.setState({
      encounters: {
        "enc-1": {
          superbill,
          loadStatus: "loaded",
          error: null,
          mdm: null,
          warnings: [],
          isSaving: false,
        },
      },
    });

    const newItem = makeLineItem({
      id: "li-2",
      cptCode: "92015",
      fee: 45,
      units: 1,
    });
    mockApiFetch.mockResolvedValueOnce(newItem);

    await useBillingStore.getState().addLineItem("enc-1", {
      cptCode: "92015",
      description: "Refraction",
      fee: 45,
      units: 1,
    });

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill!.lineItems).toHaveLength(2);
    expect(slice.superbill!.totalFee).toBe(220); // 175 + 45
  });

  test("no-ops when superbill is null", async () => {
    await useBillingStore.getState().addLineItem("enc-1", {
      cptCode: "92015",
      description: "Refraction",
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeLineItem
// ---------------------------------------------------------------------------

describe("removeLineItem", () => {
  test("removes line item and recalculates totalFee", async () => {
    const li1 = makeLineItem({ id: "li-1", fee: 175, units: 1 });
    const li2 = makeLineItem({ id: "li-2", cptCode: "92015", fee: 45, units: 1 });
    const superbill = makeSuperbill({
      lineItems: [li1, li2],
      totalFee: 220,
    });
    useBillingStore.setState({
      encounters: {
        "enc-1": {
          superbill,
          loadStatus: "loaded",
          error: null,
          mdm: null,
          warnings: [],
          isSaving: false,
        },
      },
    });
    mockApiFetch.mockResolvedValueOnce(undefined);

    await useBillingStore.getState().removeLineItem("enc-1", "li-2");

    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.superbill!.lineItems).toHaveLength(1);
    expect(slice.superbill!.totalFee).toBe(175);
  });
});

// ---------------------------------------------------------------------------
// calculateMdm
// ---------------------------------------------------------------------------

describe("calculateMdm", () => {
  test("stores MDM result", async () => {
    const mdm = makeMdmResult();
    mockApiFetch.mockResolvedValueOnce(mdm);

    const result = await useBillingStore.getState().calculateMdm("enc-1");

    expect(result).toEqual(mdm);
    const slice = useBillingStore.getState().encounters["enc-1"];
    expect(slice.mdm).toEqual(mdm);
  });

  test("returns null on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("MDM error"));

    const result = await useBillingStore.getState().calculateMdm("enc-1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe("reset", () => {
  test("removes encounter key from state", () => {
    useBillingStore.setState({
      encounters: {
        "enc-1": {
          superbill: makeSuperbill(),
          loadStatus: "loaded",
          error: null,
          mdm: null,
          warnings: [],
          isSaving: false,
        },
      },
    });

    useBillingStore.getState().reset("enc-1");

    expect(useBillingStore.getState().encounters["enc-1"]).toBeUndefined();
  });
});
