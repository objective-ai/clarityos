import { describe, test, expect, vi, beforeEach } from "vitest";
import { useOpticalStore } from "@/store/opticalStore";
import {
  makeOpticalQueueItem,
  makeOpticalQueueResponse,
  makeRxPdfData,
  makeStatusUpdateResponse,
} from "../../helpers/fixtures/optical";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  useOpticalStore.setState(
    {
      items: [],
      total: 0,
      queueDate: "2026-03-10",
      isLoading: false,
      error: null,
      rxPdfData: null,
      isPrintPreviewOpen: false,
    },
    false,
  );
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// fetchQueue
// ---------------------------------------------------------------------------

describe("fetchQueue", () => {
  test("stores queue items on success", async () => {
    const response = makeOpticalQueueResponse([
      makeOpticalQueueItem({ encounterId: "e1" }),
      makeOpticalQueueItem({ encounterId: "e2" }),
    ]);
    mockApiFetch.mockResolvedValueOnce(response);

    await useOpticalStore.getState().fetchQueue("2026-03-10");

    const state = useOpticalStore.getState();
    expect(state.items).toHaveLength(2);
    expect(state.total).toBe(2);
    expect(state.isLoading).toBe(false);
  });

  test("uses current queueDate when no date provided", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOpticalQueueResponse());

    await useOpticalStore.getState().fetchQueue();

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("queue_date=2026-03-10"),
    );
  });

  test("sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Queue error"));

    await useOpticalStore.getState().fetchQueue();

    const state = useOpticalStore.getState();
    expect(state.error).toBe("Queue error");
    expect(state.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setQueueDate
// ---------------------------------------------------------------------------

describe("setQueueDate", () => {
  test("updates date and triggers fetch", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOpticalQueueResponse());

    useOpticalStore.getState().setQueueDate("2026-04-01");

    expect(useOpticalStore.getState().queueDate).toBe("2026-04-01");
    // fetchQueue is called but async — verify apiFetch was invoked
    await vi.waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("queue_date=2026-04-01"),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// updateItemStatus
// ---------------------------------------------------------------------------

describe("updateItemStatus", () => {
  test("updates item status optimistically", async () => {
    useOpticalStore.setState({
      items: [makeOpticalQueueItem({ encounterId: "e1", status: "waiting" })],
    });
    mockApiFetch.mockResolvedValueOnce(
      makeStatusUpdateResponse({ encounterId: "e1", status: "in_progress" }),
    );

    await useOpticalStore.getState().updateItemStatus("e1", "in_progress");

    expect(useOpticalStore.getState().items[0].status).toBe("in_progress");
  });

  test("sets error on failure", async () => {
    useOpticalStore.setState({
      items: [makeOpticalQueueItem({ encounterId: "e1" })],
    });
    mockApiFetch.mockRejectedValueOnce(new Error("Status update failed"));

    await useOpticalStore.getState().updateItemStatus("e1", "dispensed");

    expect(useOpticalStore.getState().error).toBe("Status update failed");
  });
});

// ---------------------------------------------------------------------------
// fetchRxPdfData
// ---------------------------------------------------------------------------

describe("fetchRxPdfData", () => {
  test("stores Rx PDF data", async () => {
    const data = makeRxPdfData();
    mockApiFetch.mockResolvedValueOnce(data);

    await useOpticalStore.getState().fetchRxPdfData("e1");

    expect(useOpticalStore.getState().rxPdfData).toEqual(data);
  });

  test("sets error on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Rx load failed"));

    await useOpticalStore.getState().fetchRxPdfData("e1");

    expect(useOpticalStore.getState().error).toBe("Rx load failed");
  });
});

// ---------------------------------------------------------------------------
// openPrintPreview / closePrintPreview
// ---------------------------------------------------------------------------

describe("openPrintPreview", () => {
  test("fetches Rx data and opens preview", async () => {
    const data = makeRxPdfData();
    mockApiFetch.mockResolvedValueOnce(data);

    await useOpticalStore.getState().openPrintPreview("e1");

    const state = useOpticalStore.getState();
    expect(state.isPrintPreviewOpen).toBe(true);
    expect(state.rxPdfData).toEqual(data);
  });
});

describe("closePrintPreview", () => {
  test("clears data and closes preview", () => {
    useOpticalStore.setState({
      isPrintPreviewOpen: true,
      rxPdfData: makeRxPdfData(),
    });

    useOpticalStore.getState().closePrintPreview();

    const state = useOpticalStore.getState();
    expect(state.isPrintPreviewOpen).toBe(false);
    expect(state.rxPdfData).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe("clearError", () => {
  test("resets error to null", () => {
    useOpticalStore.setState({ error: "Some error" });
    useOpticalStore.getState().clearError();
    expect(useOpticalStore.getState().error).toBeNull();
  });
});
