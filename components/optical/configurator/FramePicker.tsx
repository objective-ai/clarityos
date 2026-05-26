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
  const { draft } = useOpticalOrderConfigStore();
  const [search, setSearch] = useState("");

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
          return (
            <div
              key={p.id}
              className={`rounded border p-2 text-left text-xs ${
                selected
                  ? "border-[#2DD4BF]"
                  : "border-[var(--glass-border)]"
              }`}
            >
              <div className="text-[var(--text-primary)]">
                {p.brand} {p.model}
              </div>
              <div className="text-[var(--text-muted)]">
                SKU {p.sku} · ${p.retailPrice}
              </div>
            </div>
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
