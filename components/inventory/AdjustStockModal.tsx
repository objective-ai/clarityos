"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/store/inventoryStore";
import type { AdjustStockPayload, Product } from "@/types/inventory";

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product;
}

export function AdjustStockModal({ open, onClose, product }: Props) {
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const [qtyDelta, setQtyDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setQtyDelta("");
      setNote("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    setError(null);
    const delta = Number(qtyDelta);
    if (!Number.isFinite(delta) || delta === 0 || !Number.isInteger(delta)) {
      setError("Delta must be a non-zero integer (use negative for decrement).");
      return;
    }
    if (!note.trim()) {
      setError("Note is required for manual adjustments (audit trail).");
      return;
    }
    setSubmitting(true);
    try {
      const payload: AdjustStockPayload = {
        qtyDelta: delta,
        note: note.trim(),
        reason: "manual_adjust",
      };
      await adjustStock(product.id, payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Adjust Stock — {product.brand} {product.model}
          </DialogTitle>
        </DialogHeader>
        <div className="px-7 pb-4 space-y-3">
          <div className="text-sm text-[var(--text-secondary)]">
            Current stock:{" "}
            <span className="font-semibold">{product.stockQty}</span> · SKU{" "}
            <span className="font-mono text-xs">{product.sku}</span>
          </div>
          <input
            className="glass-input w-full"
            placeholder="Delta (e.g. -3 to decrement, +5 to increment)"
            type="number"
            value={qtyDelta}
            onChange={(e) => setQtyDelta(e.target.value)}
          />
          <input
            className="glass-input w-full"
            placeholder="Reason / note (required)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <div className="text-red-300 text-sm">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            Adjust
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
