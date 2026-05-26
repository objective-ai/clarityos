"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/store/inventoryStore";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";
import type {
  OpticalOrder,
  OpticalOrderActionWarning,
  OpticalOrderCreatePayload,
  OpticalOrderLineItemCreatePayload,
} from "@/types/opticalOrder";

interface Props {
  open: boolean;
  patientId: string;
  /** Pre-fill encounter when called from optical-queue card (13-13). */
  encounterId?: string | null;
  onClose: () => void;
  onCreated?: (
    order: OpticalOrder,
    warnings?: OpticalOrderActionWarning[],
  ) => void | Promise<void>;
}

interface DraftLine {
  productId: string;
  qty: number;
  unitPrice: string;
}

export function CreateWalkInOrderModal({
  open,
  patientId,
  encounterId,
  onClose,
  onCreated,
}: Props) {
  const router = useRouter();
  const products = useInventoryStore((s) => s.products);
  const loadProducts = useInventoryStore((s) => s.loadProducts);
  const createOrder = useOpticalOrderStore((s) => s.createOrder);
  const placeOrder = useOpticalOrderStore((s) => s.placeOrder);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [autoPlace, setAutoPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setAutoPlace(false);
    setError(null);
    void loadProducts({ activeOnly: true });
  }, [open, loadProducts]);

  function addLine(product: (typeof products)[number]) {
    setLines((curr) => [
      ...curr,
      {
        productId: product.id,
        qty: 1,
        unitPrice: String(product.retailPrice),
      },
    ]);
  }

  function removeLine(idx: number) {
    setLines((curr) => curr.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((curr) =>
      curr.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  }

  async function handleSubmit() {
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: OpticalOrderCreatePayload = {
        patientId,
        encounterId: encounterId ?? null,
        lineItems: lines.map<OpticalOrderLineItemCreatePayload>((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
      };
      let created = await createOrder(payload);
      let warnings: OpticalOrderActionWarning[] = [];
      if (autoPlace) {
        const result = await placeOrder(created.id);
        created = result.order;
        warnings = result.warnings;
      }

      // Phase 14 OPT14-13 — spectacle (frame) lines need the configurator to
      // capture lens config + measurements + vision plan. Contacts-only
      // walk-ins keep the existing close-and-toast flow.
      const hasFrameLine = lines.some((line) => {
        const product = products.find((p) => p.id === line.productId);
        return product?.productType === "frame";
      });
      if (hasFrameLine && !autoPlace) {
        await onCreated?.(created, warnings);
        onClose();
        router.push(`/optical/orders/${created.id}/`);
        return;
      }

      await onCreated?.(created, warnings);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const total = lines.reduce(
    (sum, l) => sum + Number(l.unitPrice) * l.qty,
    0,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {encounterId ? "New optical order" : "New walk-in optical order"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-7 pb-2">
          <section>
            <h4 className="text-sm font-medium mb-2">Add products</h4>
            <div className="max-h-48 overflow-y-auto glass-card p-2 space-y-1">
              {products.length === 0 && (
                <div className="text-sm text-[var(--text-muted)] p-2">
                  No active products. Seed first.
                </div>
              )}
              {products.slice(0, 50).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addLine(p)}
                  className="w-full text-left p-2 rounded hover:bg-[var(--bg-glass)] text-sm flex justify-between text-[var(--text-primary)]"
                >
                  <span>
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {p.sku}
                    </span>{" "}
                    · {p.brand} {p.model}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    ${p.retailPrice} · {p.stockQty} in stock
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-medium mb-2">
              Line items ({lines.length})
            </h4>
            {lines.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">
                No line items yet — pick a product above.
              </div>
            ) : (
              <ul className="space-y-2">
                {lines.map((l, i) => {
                  const p = products.find((pp) => pp.id === l.productId);
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <div className="flex-1 text-sm">
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {p?.sku ?? l.productId.slice(0, 8)}
                        </span>{" "}
                        {p?.brand} {p?.model}
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) =>
                          updateLine(i, {
                            qty: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="glass-input w-20"
                        aria-label="Quantity"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={l.unitPrice}
                        onChange={(e) =>
                          updateLine(i, { unitPrice: e.target.value })
                        }
                        className="glass-input w-28"
                        aria-label="Unit price"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLine(i)}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoPlace}
                onChange={(e) => setAutoPlace(e.target.checked)}
              />
              Place immediately (decrement stock)
            </label>
            <div className="text-lg font-semibold">${total.toFixed(2)}</div>
          </div>

          {error && <div className="text-red-300 text-sm">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || lines.length === 0}
          >
            {autoPlace ? "Create & Place" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
