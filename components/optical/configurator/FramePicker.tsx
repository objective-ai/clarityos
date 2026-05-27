"use client";

import { useEffect, useMemo, useState } from "react";

import { useInventoryStore } from "@/store/inventoryStore";
import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

interface FieldError {
  path: string;
  code?: string;
  message: string;
}

interface Props {
  orderId: string;
  fieldErrors: FieldError[];
}

export function FramePicker({ orderId, fieldErrors }: Props) {
  const { products, loadProducts } = useInventoryStore();
  const { draft, addLineItem, removeLineItem } = useOpticalOrderConfigStore();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadProducts({ productType: "frame", activeOnly: true });
  }, [loadProducts]);

  const frameProducts = useMemo(
    () => products.filter((p: any) => p.productType === "frame"),
    [products],
  );

  const filtered = useMemo(() => {
    if (!search) return frameProducts;
    const q = search.toLowerCase();
    return frameProducts.filter((p: any) =>
      `${p.brand ?? ""} ${p.model ?? ""} ${p.sku ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [frameProducts, search]);

  const lineFrameIds = new Set(
    (draft?.lineItems ?? [])
      .map((li) => li.productId)
      .filter((id): id is string => Boolean(id)),
  );

  const lineByProductId = new Map<string, string>();
  for (const li of draft?.lineItems ?? []) {
    if (li.productId) lineByProductId.set(li.productId, li.id);
  }

  const frameErrors = fieldErrors.filter((e) => e.path.includes("product"));

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Frame
      </h2>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search frames by brand, model, or SKU…"
        className="w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <div className="mt-3 grid max-h-48 grid-cols-2 gap-2 overflow-auto">
        {filtered.length === 0 && (
          <div className="col-span-2 text-xs text-[var(--text-muted)]">
            {search
              ? "No frames match that search."
              : "No frames in inventory yet."}
          </div>
        )}
        {filtered.map((p: any) => {
          const selected = lineFrameIds.has(p.id);
          const isAdding = adding === p.id;
          const isRemoving = removing === p.id;

          const chipBody = (
            <>
              <div className="text-[var(--text-primary)]">
                {p.brand} {p.model}
              </div>
              <div className="text-[var(--text-muted)]">
                SKU {p.sku} · ${p.retailPrice}
              </div>
              {isAdding && (
                <div className="mt-1 text-[10px] uppercase text-[#2DD4BF]">
                  Adding…
                </div>
              )}
              {selected && !isAdding && (
                <div className="mt-1 text-[10px] uppercase text-[#2DD4BF]">
                  Added
                </div>
              )}
            </>
          );

          if (selected) {
            // Use a <div> wrapper when selected so the × <button> can nest
            // without violating the no-nested-interactive-controls rule.
            return (
              <div
                key={p.id}
                className={`relative rounded border border-[#2DD4BF] p-2 text-left text-xs ${
                  isRemoving ? "opacity-60" : ""
                }`}
              >
                {chipBody}
                <button
                  type="button"
                  aria-label="Remove frame"
                  title="Remove this frame from the order"
                  disabled={isRemoving}
                  onClick={async () => {
                    const lineId = lineByProductId.get(p.id);
                    if (!lineId) return;
                    setRemoving(p.id);
                    try {
                      await removeLineItem(lineId);
                    } finally {
                      setRemoving(null);
                    }
                  }}
                  className="absolute right-1 top-1 rounded-full px-1.5 text-[10px] leading-none text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                >
                  ×
                </button>
              </div>
            );
          }

          return (
            <button
              key={p.id}
              type="button"
              disabled={isAdding}
              onClick={async () => {
                setAdding(p.id);
                try {
                  await addLineItem(p.id, p.retailPrice);
                } finally {
                  setAdding(null);
                }
              }}
              className={`rounded border p-2 text-left text-xs border-[var(--glass-border)] hover:border-[#2DD4BF]/60 ${
                isAdding ? "opacity-60" : ""
              }`}
            >
              {chipBody}
            </button>
          );
        })}
      </div>
      {frameErrors.map((e) => (
        <div key={e.path} className="mt-2 text-xs text-red-400">
          {e.message}
        </div>
      ))}
      {!orderId ? null : null}
    </section>
  );
}
