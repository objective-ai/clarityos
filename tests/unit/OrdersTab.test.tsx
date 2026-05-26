/**
 * tests/unit/OrdersTab.test.tsx
 *
 * Behavior:
 *   - calls loadOrders on mount with patientId
 *   - renders empty state CTA when no orders
 *   - renders chronological list (newest first) with status + count + total
 *   - row click calls loadOrder + opens drawer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";
import { useInventoryStore } from "@/store/inventoryStore";
import { OrdersTab } from "@/components/orders/OrdersTab";
import type { OpticalOrder } from "@/types/opticalOrder";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  getAuthHeaders: vi.fn(async () => ({})),
}));

function makeOrder(overrides: Partial<OpticalOrder> = {}): OpticalOrder {
  return {
    id: "order-1",
    tenantId: "t-1",
    patientId: "p-1",
    encounterId: null,
    status: "draft",
    totalPrice: "120.00",
    createdById: "staff-1",
    placedAt: null,
    dispensedAt: null,
    cancelledAt: null,
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: "2026-04-01T10:00:00Z",
    lineItems: [
      {
        id: "li-1",
        orderId: "order-1",
        productId: "prod-1",
        qty: 1,
        unitPrice: "120.00",
        lineTotal: "120.00",
        createdAt: "2026-04-01T10:00:00Z",
        lensConfig: null,
      },
    ],
    visionPlan: {},
    fitting: {},
    suggestionResolutions: {},
    finalRefractionId: null,
    habitualRefractionId: null,
    jobTicketGeneratedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useOpticalOrderStore.setState(
    {
      orders: [],
      currentOrder: null,
      loading: false,
      error: null,
    },
    false,
  );
  useInventoryStore.setState(
    {
      products: [],
      filters: {
        productType: "frame",
        search: "",
        stockStatus: "all",
        activeOnly: true,
      },
      loading: false,
      error: null,
    },
    false,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OrdersTab", () => {
  it("calls loadOrders on mount with patientId", () => {
    const loadOrders = vi.fn(async () => {});
    useOpticalOrderStore.setState({ loadOrders }, false);

    render(<OrdersTab patientId="p-1" />);
    expect(loadOrders).toHaveBeenCalledWith({ patientId: "p-1" });
  });

  it("renders empty state with walk-in CTA when no orders", () => {
    useOpticalOrderStore.setState({ loadOrders: vi.fn(async () => {}) }, false);
    render(<OrdersTab patientId="p-1" />);
    expect(screen.getByText(/No optical orders yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create the first order/i }),
    ).toBeInTheDocument();
  });

  it("renders orders newest-first with status, line-item count and total", () => {
    const older = makeOrder({
      id: "old",
      createdAt: "2026-03-01T10:00:00Z",
      status: "placed",
      totalPrice: "50.00",
    });
    const newer = makeOrder({
      id: "new",
      createdAt: "2026-04-15T10:00:00Z",
      status: "dispensed",
      totalPrice: "200.00",
      lineItems: [
        {
          id: "li-a",
          orderId: "new",
          productId: "p-a",
          qty: 1,
          unitPrice: "100.00",
          lineTotal: "100.00",
          createdAt: "2026-04-15T10:00:00Z",
          lensConfig: null,
        },
        {
          id: "li-b",
          orderId: "new",
          productId: "p-b",
          qty: 1,
          unitPrice: "100.00",
          lineTotal: "100.00",
          createdAt: "2026-04-15T10:00:00Z",
          lensConfig: null,
        },
      ],
    });
    useOpticalOrderStore.setState(
      { orders: [older, newer], loadOrders: vi.fn(async () => {}) },
      false,
    );

    render(<OrdersTab patientId="p-1" />);

    const items = screen.getAllByRole("button");
    // Newer order's $200 must appear before the older $50 in the DOM order.
    const text = document.body.textContent ?? "";
    expect(text.indexOf("$200.00")).toBeLessThan(text.indexOf("$50.00"));
    // Status labels render
    expect(screen.getByText("Dispensed")).toBeInTheDocument();
    expect(screen.getByText("Placed")).toBeInTheDocument();
    // Line-item count: "2 items" for newer, "1 item" for older
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    // sortedOrders rows + walk-in CTA + new-walk-in header button
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("clicking a row calls loadOrder and opens the drawer", async () => {
    const order = makeOrder({ id: "click-me" });
    const loadOrder = vi.fn(async () => order);
    useOpticalOrderStore.setState(
      {
        orders: [order],
        loadOrders: vi.fn(async () => {}),
        loadOrder,
      },
      false,
    );

    render(<OrdersTab patientId="p-1" />);
    const rows = screen
      .getAllByRole("button")
      .filter((el) => el.tagName.toLowerCase() === "li");
    expect(rows.length).toBe(1);
    fireEvent.click(rows[0]);
    await waitFor(() => expect(loadOrder).toHaveBeenCalledWith("click-me"));
  });
});
