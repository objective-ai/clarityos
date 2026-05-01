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
import type { Product, ReceiveStockPayload } from "@/types/inventory";

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product;
}

export function ReceiveStockModal({ open, onClose, product }: Props) {
  const receiveStock = useInventoryStore((s) => s.receiveStock);
  const [qtyReceived, setQtyReceived] = useState("");
  const [poReference, setPoReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setQtyReceived("");
      setPoReference("");
      setNote("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    setError(null);
    const qty = Number(qtyReceived);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setError("Quantity must be a positive integer.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: ReceiveStockPayload = {
        qtyReceived: qty,
        poReference: poReference.trim() || undefined,
        note: note.trim() || undefined,
      };
      await receiveStock(product.id, payload);
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
            Receive Stock — {product.brand} {product.model}
          </DialogTitle>
        </DialogHeader>
        <div className="px-7 pb-4 space-y-3">
          <div className="text-sm text-white/70">
            Current stock:{" "}
            <span className="font-semibold">{product.stockQty}</span> · SKU{" "}
            <span className="font-mono text-xs">{product.sku}</span>
          </div>
          <input
            className="glass-input w-full"
            placeholder="Quantity received"
            type="number"
            min={1}
            value={qtyReceived}
            onChange={(e) => setQtyReceived(e.target.value)}
          />
          <input
            className="glass-input w-full"
            placeholder="PO reference (optional)"
            value={poReference}
            onChange={(e) => setPoReference(e.target.value)}
          />
          <input
            className="glass-input w-full"
            placeholder="Note (optional)"
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
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
