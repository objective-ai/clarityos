"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useLensCatalogStore } from "@/store/lensCatalogStore";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";
import type {
  OpticalOrder,
  OpticalOrderActionWarning,
  OrderStatus,
} from "@/types/opticalOrder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BadgeVariant = "secondary" | "info" | "success" | "destructive";

interface Props {
  open: boolean;
  order: OpticalOrder | null;
  /** Role of the current user — used to gate the Cancel CTA. */
  userRole?: string | null;
  /** Warnings from the most recent place action — shown as banner at top. */
  warnings?: OpticalOrderActionWarning[];
  onClose: () => void;
}

const CANCEL_ROLES = new Set(["owner", "admin"]);

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  dispensed: "Dispensed",
  cancelled: "Cancelled",
};

const STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeVariant> = {
  draft: "secondary",
  placed: "info",
  dispensed: "success",
  cancelled: "destructive",
};

function resolveLensConfigDisplay(
  lc: Record<string, any> | null | undefined,
  lensTypes: { id: string; name: string }[],
  lensMaterials: { id: string; name: string }[],
  lensCoatings: { id: string; name: string }[],
) {
  if (!lc) return null;
  const type =
    lensTypes.find((t) => t.id === lc.lens_type_id)?.name ?? "—";
  const material =
    lensMaterials.find((m) => m.id === lc.material_id)?.name ?? "—";
  const coatings = (lc.coating_ids ?? [])
    .map((cid: string) => lensCoatings.find((c) => c.id === cid)?.name)
    .filter(Boolean)
    .join(", ");
  return { type, material, coatings };
}

export function OrderDetailDrawer({
  open,
  order,
  userRole,
  warnings,
  onClose,
}: Props) {
  const cancelOrder = useOpticalOrderStore((s) => s.cancelOrder);
  const loadOrder = useOpticalOrderStore((s) => s.loadOrder);
  const { lensTypes, lensMaterials, lensCoatings, loadAll: loadLensCatalogs } =
    useLensCatalogStore();
  const [mounted, setMounted] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [generatingTicket, setGeneratingTicket] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      void loadLensCatalogs();
    }
  }, [open, loadLensCatalogs]);

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
  if (!mounted) return null;

  const canCancel =
    !!order &&
    userRole !== undefined &&
    userRole !== null &&
    CANCEL_ROLES.has(userRole.toLowerCase()) &&
    (order.status === "draft" || order.status === "placed");

  async function handleGenerateJobTicket() {
    if (!order || generatingTicket) return;
    setGeneratingTicket(true);
    try {
      const resp = await fetch(
        `/api/optical-orders/${order.id}/job-ticket/`,
        { method: "POST" },
      );
      if (!resp.ok) {
        console.error("Job ticket generation failed", resp.status);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `job-ticket-${order.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      // Refresh so jobTicketGeneratedAt populates → label flips to "Re-generate".
      await loadOrder(order.id);
    } catch (e) {
      console.error("Job ticket download failed", (e as Error).message);
    } finally {
      setGeneratingTicket(false);
    }
  }

  async function handleCancel() {
    if (!order || cancelling) return;
    if (
      !confirm(
        `Cancel order ${order.id.slice(0, 8)}? This will restock all line items.`,
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await cancelOrder(order.id);
      // Keep drawer open so the user sees the updated status pill ("Cancelled"),
      // the new Cancelled timestamp in the Timeline, and the Cancel CTA hidden.
      // User explicitly closes via the X button or backdrop click.
    } catch (e) {
      alert(`Failed to cancel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCancelling(false);
    }
  }

  return createPortal(
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
            {warnings && warnings.length > 0 && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  background: "rgba(251,191,36,0.10)",
                  borderColor: "rgba(251,191,36,0.35)",
                  color: "var(--text-primary)",
                }}
              >
                <div
                  className="font-semibold mb-1"
                  style={{ color: "#FBBF24" }}
                >
                  Order placed with warning
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Header */}
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Optical order
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE_VARIANT[order.status]}>
                  {STATUS_LABELS[order.status]}
                </Badge>
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
                {order.lineItems.map((li) => {
                  const lensDisplay = resolveLensConfigDisplay(
                    li.lensConfig,
                    lensTypes,
                    lensMaterials,
                    lensCoatings,
                  );
                  return (
                    <li
                      key={li.id}
                      className="glass-card p-3 text-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-mono text-xs text-[var(--text-muted)]">
                            {li.productId.slice(0, 8)}
                          </div>
                          <div>
                            Qty {li.qty} × ${li.unitPrice}
                          </div>
                        </div>
                        <div className="font-medium">${li.lineTotal}</div>
                      </div>
                      {lensDisplay && (
                        <div className="mt-1 pl-3 text-xs text-[var(--text-secondary)] border-l-2 border-[var(--glass-border)]">
                          <div>
                            Lens: {lensDisplay.type} · {lensDisplay.material}
                          </div>
                          {lensDisplay.coatings && (
                            <div>Coatings: {lensDisplay.coatings}</div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Vision Plan (Phase 14) */}
            {order.visionPlan &&
              Object.keys(order.visionPlan).length > 0 && (
                <section className="pt-3 border-t border-[var(--glass-border)]">
                  <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
                    Vision Plan
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--text-primary)]">
                    {order.visionPlan.name && (
                      <>
                        <dt className="text-[var(--text-muted)]">Plan</dt>
                        <dd>{order.visionPlan.name}</dd>
                      </>
                    )}
                    {order.visionPlan.member_id && (
                      <>
                        <dt className="text-[var(--text-muted)]">Member ID</dt>
                        <dd>{order.visionPlan.member_id}</dd>
                      </>
                    )}
                    {order.visionPlan.group_number && (
                      <>
                        <dt className="text-[var(--text-muted)]">Group #</dt>
                        <dd>{order.visionPlan.group_number}</dd>
                      </>
                    )}
                    {order.visionPlan.authorization_number && (
                      <>
                        <dt className="text-[var(--text-muted)]">Auth #</dt>
                        <dd>{order.visionPlan.authorization_number}</dd>
                      </>
                    )}
                    {order.visionPlan.copay != null && (
                      <>
                        <dt className="text-[var(--text-muted)]">Copay</dt>
                        <dd>${order.visionPlan.copay}</dd>
                      </>
                    )}
                    {order.visionPlan.allowance != null && (
                      <>
                        <dt className="text-[var(--text-muted)]">Allowance</dt>
                        <dd>${order.visionPlan.allowance}</dd>
                      </>
                    )}
                  </dl>
                </section>
              )}

            {/* Generate Job Ticket (Phase 14) — only when placed */}
            {order.status === "placed" && (
              <section className="pt-3 border-t border-[var(--glass-border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateJobTicket}
                  disabled={generatingTicket}
                  className="border-[var(--glass-border)] text-[var(--text-primary)]"
                >
                  {generatingTicket
                    ? "Generating…"
                    : order.jobTicketGeneratedAt
                      ? "Re-generate Job Ticket"
                      : "Generate Job Ticket"}
                </Button>
                {order.jobTicketGeneratedAt && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Last generated{" "}
                    {new Date(order.jobTicketGeneratedAt).toLocaleString()}
                  </p>
                )}
              </section>
            )}

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
              <div className="pt-4 border-t border-[var(--glass-border)]">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full"
                >
                  {cancelling ? "Cancelling..." : "Cancel order"}
                </Button>
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
    </>,
    document.body,
  );
}
