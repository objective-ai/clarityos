"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";
import type { OpticalOrder, OrderStatus } from "@/types/opticalOrder";

interface Props {
  open: boolean;
  order: OpticalOrder | null;
  /** Role of the current user — used to gate the Cancel CTA. */
  userRole?: string | null;
  onClose: () => void;
}

const CANCEL_ROLES = new Set(["owner", "admin"]);

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  dispensed: "Dispensed",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  draft: "bg-[var(--bg-glass)] text-[var(--text-secondary)]",
  placed: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  dispensed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-200",
};

export function OrderDetailDrawer({ open, order, userRole, onClose }: Props) {
  const cancelOrder = useOpticalOrderStore((s) => s.cancelOrder);

  // ESC key closes drawer (verbatim from AppointmentDetailDrawer)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Hydration safety — Phase 10.2-07 fix (verbatim)
  if (!open && !order) return null;

  const canCancel =
    !!order &&
    userRole !== undefined &&
    userRole !== null &&
    CANCEL_ROLES.has(userRole.toLowerCase()) &&
    (order.status === "draft" || order.status === "placed");

  async function handleCancel() {
    if (!order) return;
    if (
      !confirm(
        `Cancel order ${order.id.slice(0, 8)}? This will restock all line items.`,
      )
    ) {
      return;
    }
    try {
      await cancelOrder(order.id);
      onClose();
    } catch (e) {
      alert(`Failed to cancel: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      {/* Backdrop — clickable to close */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[480px] max-md:w-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`Order details${order ? ` for order ${order.id}` : ""}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-glass)] transition-colors"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>

        {order ? (
          <div className="p-6 pt-12 flex-1 overflow-y-auto space-y-6">
            {/* Header */}
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Optical order
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE_CLASS[order.status]}`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
                <span className="font-mono text-xs text-[var(--text-secondary)]">
                  {order.id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold">
                ${order.totalPrice}
              </div>
            </div>

            {/* Line items */}
            <section>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                Line items ({order.lineItems.length})
              </h3>
              <ul className="space-y-2">
                {order.lineItems.map((li) => (
                  <li
                    key={li.id}
                    className="glass-card p-3 flex justify-between items-start text-sm"
                  >
                    <div>
                      <div className="font-mono text-xs text-[var(--text-muted)]">
                        {li.productId.slice(0, 8)}
                      </div>
                      <div>
                        Qty {li.qty} × ${li.unitPrice}
                      </div>
                    </div>
                    <div className="font-medium">${li.lineTotal}</div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Status timeline */}
            <section>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Timeline</h3>
              <ol className="text-sm space-y-1">
                <li>
                  <span className="text-[var(--text-muted)]">Created:</span>{" "}
                  {new Date(order.createdAt).toLocaleString()}
                </li>
                {order.placedAt && (
                  <li>
                    <span className="text-[var(--text-muted)]">Placed:</span>{" "}
                    {new Date(order.placedAt).toLocaleString()}
                  </li>
                )}
                {order.dispensedAt && (
                  <li>
                    <span className="text-[var(--text-muted)]">Dispensed:</span>{" "}
                    {new Date(order.dispensedAt).toLocaleString()}
                  </li>
                )}
                {order.cancelledAt && (
                  <li>
                    <span className="text-[var(--text-muted)]">Cancelled:</span>{" "}
                    {new Date(order.cancelledAt).toLocaleString()}
                  </li>
                )}
              </ol>
            </section>

            {/* Cancel CTA — gated */}
            {canCancel && (
              <div className="pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full py-2 px-4 rounded-md bg-red-500/15 text-red-700 dark:text-red-200 hover:bg-red-500/25 transition-colors text-sm font-medium"
                >
                  Cancel order
                </button>
                {order.status === "placed" && (
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Cancelling will restock all line-item products in a single
                    transaction.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 pt-12 text-[var(--text-muted)]">Loading order...</div>
        )}
      </div>
    </>
  );
}
