"use client";

import { useEffect, useState } from "react";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";
import { OrderDetailDrawer } from "@/components/orders/OrderDetailDrawer";
import { CreateWalkInOrderModal } from "@/components/orders/CreateWalkInOrderModal";
import type { OpticalOrder, OrderStatus } from "@/types/opticalOrder";
import { Button } from "@/components/ui/button";

interface Props {
  patientId: string;
  /** Pulled from session for Cancel CTA gating in the drawer. */
  userRole?: string | null;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  dispensed: "Dispensed",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  draft: "bg-[var(--bg-glass)] text-[var(--text-secondary)]",
  placed: "bg-blue-500/20 text-blue-200",
  dispensed: "bg-emerald-500/20 text-emerald-200",
  cancelled: "bg-red-500/20 text-red-200",
};

export function OrdersTab({ patientId, userRole }: Props) {
  const orders = useOpticalOrderStore((s) => s.orders);
  const loading = useOpticalOrderStore((s) => s.loading);
  const error = useOpticalOrderStore((s) => s.error);
  const currentOrder = useOpticalOrderStore((s) => s.currentOrder);
  const loadOrders = useOpticalOrderStore((s) => s.loadOrders);
  const loadOrder = useOpticalOrderStore((s) => s.loadOrder);
  const clearCurrentOrder = useOpticalOrderStore((s) => s.clearCurrentOrder);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  useEffect(() => {
    void loadOrders({ patientId });
  }, [patientId, loadOrders]);

  async function openOrder(order: OpticalOrder) {
    await loadOrder(order.id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    // Defer clearCurrentOrder so the drawer's slide-out animation finishes
    // before the panel goes blank.
    window.setTimeout(() => clearCurrentOrder(), 250);
  }

  // Newest first — orders array order from API may not be guaranteed.
  const sortedOrders = [...orders].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Optical orders</h3>
        <Button size="sm" onClick={() => setWalkInOpen(true)}>
          + New Walk-In Order
        </Button>
      </header>

      {loading && (
        <div className="animate-pulse text-[var(--text-muted)]">Loading orders...</div>
      )}
      {error && (
        <div className="text-red-300 text-sm">
          Failed to load orders: {error}
        </div>
      )}

      {!loading && !error && sortedOrders.length === 0 && (
        <div className="glass-card p-8 text-center text-[var(--text-secondary)]">
          <div className="mb-3">No optical orders yet.</div>
          <Button onClick={() => setWalkInOpen(true)}>
            + Create the first order
          </Button>
        </div>
      )}

      {sortedOrders.length > 0 && (
        <ul className="space-y-2">
          {sortedOrders.map((o) => (
            <li
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => void openOrder(o)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void openOrder(o);
              }}
              className="glass-card p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
            >
              <div>
                <div className="text-sm text-[var(--text-muted)]">
                  {new Date(o.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE_CLASS[o.status]}`}
                  >
                    {STATUS_LABELS[o.status]}
                  </span>
                  <span className="text-sm">
                    {o.lineItems.length}{" "}
                    {o.lineItems.length === 1 ? "item" : "items"}
                  </span>
                </div>
              </div>
              <div className="text-lg font-semibold">${o.totalPrice}</div>
            </li>
          ))}
        </ul>
      )}

      <OrderDetailDrawer
        open={drawerOpen}
        order={currentOrder}
        userRole={userRole}
        onClose={closeDrawer}
      />

      <CreateWalkInOrderModal
        open={walkInOpen}
        patientId={patientId}
        onClose={() => setWalkInOpen(false)}
        onCreated={async (created) => {
          setWalkInOpen(false);
          await loadOrder(created.id);
          setDrawerOpen(true);
        }}
      />
    </div>
  );
}
