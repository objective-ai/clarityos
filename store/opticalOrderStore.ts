import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";
import type {
  OpticalOrder,
  OpticalOrderCreatePayload,
  OpticalOrderPlaceResponse,
} from "@/types/opticalOrder";

interface LoadOrdersParams {
  patientId?: string;
  encounterId?: string;
}

interface OpticalOrderStore {
  orders: OpticalOrder[];
  currentOrder: OpticalOrder | null;
  loading: boolean;
  error: string | null;

  loadOrders: (params: LoadOrdersParams) => Promise<void>;
  loadOrder: (orderId: string) => Promise<OpticalOrder>;
  clearCurrentOrder: () => void;
  createOrder: (payload: OpticalOrderCreatePayload) => Promise<OpticalOrder>;
  placeOrder: (orderId: string) => Promise<OpticalOrderPlaceResponse>;
  cancelOrder: (orderId: string) => Promise<OpticalOrder>;
  dispenseOrder: (orderId: string) => Promise<OpticalOrder>;
}

// Uses apiFetch (camelize/snakify) — OpticalOrder has no nested JSONB attribute
// keys to protect. Top-level fields are snake_case ↔ camelCase clean. Contrast
// with inventoryStore which opts out of apiFetch for Product.attributes JSONB.

function _replaceOrUnchanged(
  orders: OpticalOrder[],
  updated: OpticalOrder,
): OpticalOrder[] {
  return orders.map((o) => (o.id === updated.id ? updated : o));
}

export const useOpticalOrderStore = create<OpticalOrderStore>()(
  devtools(
    (set) => ({
      orders: [],
      currentOrder: null,
      loading: false,
      error: null,

      loadOrders: async ({ patientId, encounterId }) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams();
          if (patientId) params.set("patient_id", patientId);
          if (encounterId) params.set("encounter_id", encounterId);
          const orders = await apiFetch<OpticalOrder[]>(
            `/api/optical-orders/?${params.toString()}`,
          );
          set({ orders: orders ?? [], loading: false });
        } catch (e) {
          set({
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          });
        }
      },

      loadOrder: async (orderId) => {
        const order = await apiFetch<OpticalOrder>(
          `/api/optical-orders/${orderId}/`,
        );
        set({ currentOrder: order });
        return order;
      },

      clearCurrentOrder: () => set({ currentOrder: null }),

      createOrder: async (payload) => {
        const order = await apiFetch<OpticalOrder>("/api/optical-orders/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        set((s) => ({ orders: [order, ...s.orders] }));
        return order;
      },

      placeOrder: async (orderId) => {
        const result = await apiFetch<OpticalOrderPlaceResponse>(
          `/api/optical-orders/${orderId}/place/`,
          { method: "POST" },
        );
        set((s) => ({
          orders: _replaceOrUnchanged(s.orders, result.order),
          currentOrder:
            s.currentOrder?.id === result.order.id
              ? result.order
              : s.currentOrder,
        }));
        return result;
      },

      cancelOrder: async (orderId) => {
        const order = await apiFetch<OpticalOrder>(
          `/api/optical-orders/${orderId}/cancel/`,
          { method: "POST" },
        );
        set((s) => ({
          orders: _replaceOrUnchanged(s.orders, order),
          currentOrder:
            s.currentOrder?.id === order.id ? order : s.currentOrder,
        }));
        return order;
      },

      dispenseOrder: async (orderId) => {
        const order = await apiFetch<OpticalOrder>(
          `/api/optical-orders/${orderId}/dispense/`,
          { method: "POST" },
        );
        set((s) => ({
          orders: _replaceOrUnchanged(s.orders, order),
          currentOrder:
            s.currentOrder?.id === order.id ? order : s.currentOrder,
        }));
        return order;
      },
    }),
    { name: "opticalOrderStore" },
  ),
);
