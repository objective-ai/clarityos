"use client";

import { useEffect, useState } from "react";
import { useInventoryStore } from "@/store/inventoryStore";
import {
  deriveStockStatus,
  type Gender,
  type Modality,
  type Product,
  type ProductType,
  type StockStatus,
} from "@/types/inventory";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { ProductFormModal } from "@/components/inventory/ProductFormModal";
import { ReceiveStockModal } from "@/components/inventory/ReceiveStockModal";
import { AdjustStockModal } from "@/components/inventory/AdjustStockModal";

type ModalState =
  | { kind: "closed" }
  | { kind: "create"; productType: ProductType }
  | { kind: "edit"; product: Product }
  | { kind: "receive"; product: Product }
  | { kind: "adjust"; product: Product };

export default function InventoryPage() {
  const { has } = useEntitlements();
  const products = useInventoryStore((s) => s.products);
  const filters = useInventoryStore((s) => s.filters);
  const loading = useInventoryStore((s) => s.loading);
  const error = useInventoryStore((s) => s.error);
  const setFilters = useInventoryStore((s) => s.setFilters);
  const loadProducts = useInventoryStore((s) => s.loadProducts);
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  useEffect(() => {
    void loadProducts();
  }, [
    filters.productType,
    filters.stockStatus,
    filters.activeOnly,
    filters.gender,
    filters.modality,
    filters.search,
    loadProducts,
  ]);

  if (!has(Entitlement.RETAIL_POS)) {
    return (
      <div className="p-8">
        <Card className="glass-card p-8 max-w-md">
          <h2 className="text-xl font-semibold mb-2">Retail & POS — $150/mo add-on</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Inventory management is part of the Retail &amp; POS add-on. Contact your owner to enable it.
          </p>
        </Card>
      </div>
    );
  }

  const activeType = filters.productType ?? "frame";

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Button
          onClick={() => setModal({ kind: "create", productType: activeType })}
        >
          + New Product
        </Button>
      </header>

      {/* Tab toggle (button group fallback — shadcn Tabs primitive not in this project) */}
      <div role="tablist" className="inline-flex rounded-lg border border-white/10 overflow-hidden">
        <button
          role="tab"
          aria-selected={activeType === "frame"}
          onClick={() =>
            setFilters({ productType: "frame", gender: undefined, modality: undefined })
          }
          className={`px-4 py-2 text-sm transition-colors ${
            activeType === "frame"
              ? "bg-[var(--bg-glass)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-glass)]"
          }`}
          data-value="frame"
        >
          Frames
        </button>
        <button
          role="tab"
          aria-selected={activeType === "contact_lens"}
          onClick={() =>
            setFilters({ productType: "contact_lens", gender: undefined, modality: undefined })
          }
          className={`px-4 py-2 text-sm transition-colors ${
            activeType === "contact_lens"
              ? "bg-[var(--bg-glass)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-glass)]"
          }`}
          data-value="contact_lens"
        >
          Contacts
        </button>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search brand or model"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={() => setFilters({ search: searchInput })}
          onKeyDown={(e) => {
            if (e.key === "Enter") setFilters({ search: searchInput });
          }}
          className="glass-input w-64"
          aria-label="Search products"
        />
        <select
          aria-label="Stock status"
          className="glass-input"
          value={filters.stockStatus ?? "all"}
          onChange={(e) =>
            setFilters({ stockStatus: e.target.value as StockStatus })
          }
        >
          <option value="all">All stock</option>
          <option value="in_stock">In stock</option>
          <option value="low">Low</option>
          <option value="out">Out</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.activeOnly ?? true}
            onChange={(e) => setFilters({ activeOnly: e.target.checked })}
          />
          Active only
        </label>
        {activeType === "frame" && (
          <select
            aria-label="Gender"
            className="glass-input"
            value={filters.gender ?? ""}
            onChange={(e) =>
              setFilters({ gender: (e.target.value || undefined) as Gender | undefined })
            }
          >
            <option value="">Any gender</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="unisex">Unisex</option>
            <option value="kids">Kids</option>
          </select>
        )}
        {activeType === "contact_lens" && (
          <select
            aria-label="Modality"
            className="glass-input"
            value={filters.modality ?? ""}
            onChange={(e) =>
              setFilters({ modality: (e.target.value || undefined) as Modality | undefined })
            }
          >
            <option value="">Any modality</option>
            <option value="daily">Daily</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
      </div>

      <ProductTable
        products={products.filter((p) => p.productType === activeType)}
        loading={loading}
        error={error}
        onEdit={(p) => setModal({ kind: "edit", product: p })}
        onReceive={(p) => setModal({ kind: "receive", product: p })}
        onAdjust={(p) => setModal({ kind: "adjust", product: p })}
      />

      <ProductFormModal
        open={modal.kind === "create" || modal.kind === "edit"}
        onClose={() => setModal({ kind: "closed" })}
        product={modal.kind === "edit" ? modal.product : undefined}
        productType={modal.kind === "create" ? modal.productType : undefined}
      />
      {modal.kind === "receive" && (
        <ReceiveStockModal
          open
          onClose={() => setModal({ kind: "closed" })}
          product={modal.product}
        />
      )}
      {modal.kind === "adjust" && (
        <AdjustStockModal
          open
          onClose={() => setModal({ kind: "closed" })}
          product={modal.product}
        />
      )}
    </div>
  );
}

interface ProductTableProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onEdit: (p: Product) => void;
  onReceive: (p: Product) => void;
  onAdjust: (p: Product) => void;
}

function ProductTable({
  products,
  loading,
  error,
  onEdit,
  onReceive,
  onAdjust,
}: ProductTableProps) {
  if (loading) {
    return <div className="p-8 animate-pulse text-[var(--text-secondary)]">Loading inventory...</div>;
  }
  if (error) {
    return <div className="p-8 text-red-300">Failed to load: {error}</div>;
  }
  if (products.length === 0) {
    return <div className="p-8 text-[var(--text-secondary)]">No products match these filters.</div>;
  }
  return (
    <Card className="glass-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs uppercase text-[var(--text-muted)] border-b border-[var(--glass-border)]">
            <th className="p-3">SKU</th>
            <th className="p-3">Brand / Model</th>
            <th className="p-3">Stock</th>
            <th className="p-3">Price</th>
            <th className="p-3">Active</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const status = deriveStockStatus(p.stockQty, p.reorderThreshold);
            return (
              <tr key={p.id} className="border-b border-white/5 last:border-0">
                <td className="p-3 font-mono text-xs">{p.sku}</td>
                <td className="p-3">
                  <div className="font-medium">{p.brand}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{p.model}</div>
                </td>
                <td className="p-3">
                  <span className="font-medium">{p.stockQty}</span>
                  <StockBadge status={status} />
                </td>
                <td className="p-3">${p.retailPrice}</td>
                <td className="p-3">
                  <Badge variant={p.isActive ? "default" : "secondary"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onReceive(p)}>
                    Receive
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onAdjust(p)}>
                    Adjust
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function StockBadge({ status }: { status: "in_stock" | "low" | "out" }) {
  if (status === "out") {
    return (
      <Badge variant="destructive" className="ml-2">
        Out
      </Badge>
    );
  }
  if (status === "low") {
    return <Badge variant="warning" className="ml-2">Low</Badge>;
  }
  return <Badge variant="success" className="ml-2">In stock</Badge>;
}
