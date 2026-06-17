"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api-client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/pos/RefundDialog";
import type { Sale, SaleStatus } from "@/types/sales";

/**
 * Patient > Payments tab — past sales for a patient + a "New sale" CTA into
 * the POS surface. Gated on the RETAIL_POS entitlement (POS-01 / POS-10).
 *
 * Each row opens the RefundDialog drawer (refund actions inside are themselves
 * gated to OWNER/ADMIN — this tab just surfaces the history).
 */

const STATUS_CHIP: Record<
  SaleStatus,
  { label: string; bg: string; fg: string }
> = {
  open: { label: "Open", bg: "var(--bg-glass)", fg: "var(--text-secondary)" },
  paid: { label: "Paid", bg: "rgba(52,211,153,0.12)", fg: "var(--state-normal)" },
  refunded: { label: "Refunded", bg: "rgba(248,113,113,0.12)", fg: "var(--state-critical)" },
  voided: { label: "Voided", bg: "var(--bg-glass)", fg: "var(--text-muted)" },
};

export function PatientPaymentsTab({ patientId }: { patientId: string }) {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const { has } = useEntitlements();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);

  const hasPos = has(Entitlement.RETAIL_POS);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Sale[]>(
        `/api/sales/?patient_id=${encodeURIComponent(patientId)}`,
      );
      setSales(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (hasPos) void fetchSales();
    else setLoading(false);
  }, [hasPos, fetchSales]);

  // Entitlement gate — no RETAIL_POS → upsell-style message, no fetch.
  if (!hasPos) {
    const meta = ENTITLEMENT_META.retail_pos;
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <h2 className="text-subhead mb-1">{meta.label}</h2>
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          {meta.description}
        </p>
      </div>
    );
  }

  function refundedTotal(sale: Sale): number {
    return (sale.refunds ?? []).reduce((s, r) => s + Number(r.totalAmount), 0);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-subhead">Payments</h2>
        <Button onClick={() => router.push(`/${tenant}/pos?patient=${patientId}`)}>
          New sale
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-4 rounded w-28" style={{ background: "var(--bg-glass)" }} />
                <div className="h-5 rounded w-20" style={{ background: "var(--bg-glass)" }} />
                <div className="h-4 rounded w-16 ml-auto" style={{ background: "var(--bg-glass)" }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-body mb-4" style={{ color: "var(--state-critical)" }}>
              {error}
            </p>
            <Button variant="outline" onClick={fetchSales}>
              Retry
            </Button>
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 px-6 text-center">
            <p className="text-subhead" style={{ color: "var(--text-primary)" }}>
              No sales yet
            </p>
            <p className="text-body" style={{ color: "var(--text-muted)" }}>
              When you ring up a copay, retail item, or optical order, it shows here.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left text-caption px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Receipt #
                </th>
                <th className="text-left text-caption px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Date
                </th>
                <th className="text-left text-caption px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Status
                </th>
                <th className="text-right text-caption px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Refunded
                </th>
                <th className="text-right text-caption px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const chip = STATUS_CHIP[sale.status] ?? STATUS_CHIP.open;
                const refunded = refundedTotal(sale);
                return (
                  <tr
                    key={sale.id}
                    onClick={() => setRefundSaleId(sale.id)}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover-row cursor-pointer"
                  >
                    <td className="px-4 py-3 text-body font-mono-data" style={{ color: "var(--text-primary)" }}>
                      {sale.receiptNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-body" style={{ color: "var(--text-secondary)" }}>
                      {new Date(sale.openedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium"
                        style={{ background: chip.bg, color: chip.fg }}
                      >
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body text-right font-mono-data" style={{ color: refunded > 0 ? "var(--state-critical)" : "var(--text-muted)" }}>
                      {refunded > 0 ? `-$${refunded.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-body text-right font-mono-data" style={{ color: "var(--text-primary)" }}>
                      ${Number(sale.total).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <RefundDialog
        saleId={refundSaleId}
        open={refundSaleId !== null}
        onOpenChange={(o) => {
          if (!o) setRefundSaleId(null);
        }}
        onIssued={() => {
          setRefundSaleId(null);
          void fetchSales();
        }}
      />
    </div>
  );
}
