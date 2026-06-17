"use client";

/**
 * Point of Sale — full-page checkout (Phase 15, POS-01).
 *
 * Layout (lg+): 60% cart pane / 40% payment panel.
 * Mobile: stacked — payment panel on top, cart below; close-sale CTA sticks
 * to the bottom on coarse-pointer devices.
 *
 * Query params:
 *   ?patient={uuid}   pre-binds the sale to a patient
 *   ?superbill={id}   shorthand to prefill a Superbill (handled via posCartStore)
 *   ?optical={id}     shorthand to prefill an OpticalOrder
 *
 * SIDEBAR-WIRE-15-10 — the "Point of Sale" sidebar entry is wired by Plan
 * 15-10. This marker is the search anchor used by the executor of that plan.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CartLineList } from "@/components/pos/CartLineList";
import { PaymentPanel } from "@/components/pos/PaymentPanel";
import { PrefillSearchModal } from "@/components/pos/PrefillSearchModal";
import { ReceiptDeliveryPrompt } from "@/components/pos/ReceiptDeliveryPrompt";
import { usePosCartStore } from "@/store/posCartStore";
import { apiFetch } from "@/lib/api-client";
import type { PaymentConfigResponse, SalePrefillItem } from "@/types/sales";

export default function PosPage() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patient");
  const superbillId = searchParams.get("superbill");
  const opticalId = searchParams.get("optical");

  const sale = usePosCartStore((s) => s.sale);
  const loading = usePosCartStore((s) => s.loading);
  const openSale = usePosCartStore((s) => s.openSale);
  const addLine = usePosCartStore((s) => s.addLine);
  const reset = usePosCartStore((s) => s.reset);

  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [prefillOpen, setPrefillOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  /* Fetch Stripe publishable key — best effort, OK on 403 (role-gated). */
  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentConfigResponse>("/api/admin/payment-config/", { retries: 0 })
      .then((cfg) => {
        if (!cancelled) setPublishableKey(cfg.stripePublishableKey);
      })
      .catch(() => {
        /* Non-OWNER roles can't read the config — Card pill stays disabled. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Auto-open a sale once we know the URL intent. */
  useEffect(() => {
    if (sale) return;
    const prefill: SalePrefillItem[] = [];
    if (superbillId) prefill.push({ kind: "superbill", sourceId: superbillId });
    if (opticalId) prefill.push({ kind: "optical_order", sourceId: opticalId });
    // `prefill=superbill:{id}` / `prefill=optical_order:{id}` — emitted by the
    // Take-payment CTAs (Plan 15-10: Superbill row, OrderDetailDrawer,
    // AppointmentDetailDrawer). Repeatable for split prefill.
    for (const raw of searchParams.getAll("prefill")) {
      const sep = raw.indexOf(":");
      if (sep < 0) continue;
      const kind = raw.slice(0, sep);
      const sourceId = raw.slice(sep + 1);
      if (!sourceId) continue;
      if (kind === "superbill" || kind === "optical_order") {
        prefill.push({ kind, sourceId });
      }
    }
    void openSale({
      patientId: patientId ?? null,
      prefill: prefill.length > 0 ? prefill : undefined,
    });
    // Intentionally not in deps: we only auto-open once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Reset on unmount so the next mount starts a fresh sale. */
  useEffect(() => () => reset(), [reset]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--bg-base)",
        padding: "24px 32px",
      }}
    >
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-heading" style={{ color: "var(--text-primary)" }}>
            Point of Sale
          </h1>
          {sale && (
            <div className="flex items-center gap-2 mt-1">
              <SaleStatusBadge status={sale.status} />
              {sale.receiptNumber && (
                <span
                  className="text-caption font-mono-data"
                  style={{ color: "var(--text-muted)" }}
                >
                  {sale.receiptNumber}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[60%_40%]">
        {/* Cart pane */}
        <section
          className="glass-card flex flex-col gap-4"
          style={{ padding: "24px" }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-overline" style={{ color: "var(--text-muted)" }}>
              Cart
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrefillOpen(true)}
                disabled={!patientId || !sale}
                className="text-caption py-2 px-3 rounded-md disabled:opacity-45"
                style={{
                  background: "transparent",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  minHeight: "44px",
                }}
              >
                Add Superbill / Order
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!sale) return;
                  await addLine({
                    description: "Custom line item",
                    qty: 1,
                    unitPrice: "0.00",
                  });
                }}
                disabled={!sale}
                className="text-caption py-2 px-3 rounded-md disabled:opacity-45"
                style={{
                  background: "transparent",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  minHeight: "44px",
                }}
              >
                Add line
              </button>
            </div>
          </div>

          {loading && !sale ? (
            <p className="text-body" style={{ color: "var(--text-muted)" }}>
              Opening sale…
            </p>
          ) : (
            <CartLineList />
          )}
        </section>

        {/* Payment pane */}
        <section className="flex flex-col gap-4">
          <p className="text-overline" style={{ color: "var(--text-muted)" }}>
            Payment
          </p>
          <PaymentPanel
            stripePublishableKey={publishableKey}
            onSaleClosed={() => setReceiptOpen(true)}
          />
        </section>
      </div>

      {prefillOpen && (
        <PrefillSearchModal
          patientId={patientId}
          onClose={() => setPrefillOpen(false)}
          onPrefill={async () => {
            /* Hook-up to a future server prefill endpoint lands in the
             * superbill/optical Take-payment refactor (Plan 15-10). For now
             * the modal just collects intent. */
          }}
        />
      )}

      {receiptOpen && sale && (
        <ReceiptDeliveryPrompt
          sale={sale}
          onDismiss={() => setReceiptOpen(false)}
        />
      )}
    </div>
  );
}

function SaleStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    open: { label: "Open", bg: "var(--bg-glass)", fg: "var(--text-secondary)" },
    paid: { label: "Paid", bg: "rgba(52,211,153,0.12)", fg: "var(--state-normal)" },
    refunded: {
      label: "Refunded",
      bg: "rgba(248,113,113,0.12)",
      fg: "var(--state-critical)",
    },
    voided: { label: "Voided", bg: "var(--bg-glass)", fg: "var(--text-muted)" },
  };
  const cfg = map[status] ?? map.open;
  return (
    <span
      className="text-overline"
      style={{
        background: cfg.bg,
        color: cfg.fg,
        padding: "4px 10px",
        borderRadius: "9999px",
        border: "1px solid var(--border-default)",
      }}
    >
      {cfg.label}
    </span>
  );
}
