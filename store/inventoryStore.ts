import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { getAuthHeaders } from "@/lib/api-client";
import type {
  AdjustStockPayload,
  Product,
  ProductCreatePayload,
  ProductFilters,
  ProductUpdatePayload,
  ReceiveStockPayload,
} from "@/types/inventory";

// IMPORTANT: We use raw `fetch + getAuthHeaders()` — NOT `apiFetch`. Per
// `feedback_camelizekeys_nested.md` and Pitfall 1 in 13-RESEARCH.md, apiFetch's
// recursive camelizeKeys would mangle Product.attributes JSONB keys
// (eye_size → eyeSize, base_curve → baseCurve), which silently corrupts the
// JSONB on save. Top-level Product fields are still camelCase on the wire
// (Pydantic CamelCaseModel handles that); only `attributes` keys must stay
// snake_case end-to-end.

interface InventoryStore {
  products: Product[];
  filters: ProductFilters;
  loading: boolean;
  error: string | null;

  setFilters: (patch: Partial<ProductFilters>) => void;
  loadProducts: (overrideFilters?: Partial<ProductFilters>) => Promise<void>;
  createProduct: (payload: ProductCreatePayload) => Promise<Product>;
  updateProduct: (id: string, payload: ProductUpdatePayload) => Promise<Product>;
  deactivateProduct: (id: string) => Promise<void>;
  receiveStock: (id: string, payload: ReceiveStockPayload) => Promise<Product>;
  adjustStock: (id: string, payload: AdjustStockPayload) => Promise<Product>;
}

const DEFAULT_FILTERS: ProductFilters = {
  productType: "frame",
  search: "",
  stockStatus: "all",
  activeOnly: true,
};

function serializeFilters(f: ProductFilters): string {
  const params = new URLSearchParams();
  if (f.productType) params.set("product_type", f.productType);
  if (f.search?.trim()) params.set("search", f.search.trim());
  if (f.stockStatus && f.stockStatus !== "all") params.set("stock_status", f.stockStatus);
  params.set("active_only", String(f.activeOnly ?? true));
  if (f.gender) params.set("gender", f.gender);
  if (f.modality) params.set("modality", f.modality);
  return params.toString();
}

export const useInventoryStore = create<InventoryStore>()(
  devtools(
    (set, get) => ({
      products: [],
      filters: DEFAULT_FILTERS,
      loading: false,
      error: null,

      setFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),

      loadProducts: async (overrideFilters) => {
        set({ loading: true, error: null });
        try {
          const filters = { ...get().filters, ...(overrideFilters ?? {}) };
          const qs = serializeFilters(filters);
          const headers = await getAuthHeaders();
          const res = await fetch(`/api/inventory/products/?${qs}`, { headers });
          if (!res.ok) throw new Error(`Failed to load products (HTTP ${res.status})`);
          const products = (await res.json()) as Product[];
          set({ products, loading: false });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loading: false });
        }
      },

      createProduct: async (payload) => {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/inventory/products/", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Create failed (HTTP ${res.status})`);
        const product = (await res.json()) as Product;
        set((s) => ({ products: [product, ...s.products] }));
        return product;
      },

      updateProduct: async (id, payload) => {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/inventory/products/${id}/`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Update failed (HTTP ${res.status})`);
        const product = (await res.json()) as Product;
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? product : p)),
        }));
        return product;
      },

      deactivateProduct: async (id) => {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/inventory/products/${id}/`, {
          method: "DELETE",
          headers,
        });
        if (!res.ok && res.status !== 204) {
          throw new Error(`Delete failed (HTTP ${res.status})`);
        }
        set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
      },

      receiveStock: async (id, payload) => {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/inventory/products/${id}/receive/`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Receive stock failed (HTTP ${res.status})`);
        const product = (await res.json()) as Product;
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? product : p)),
        }));
        return product;
      },

      adjustStock: async (id, payload) => {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/inventory/products/${id}/adjust/`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Adjust stock failed (HTTP ${res.status})`);
        const product = (await res.json()) as Product;
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? product : p)),
        }));
        return product;
      },
    }),
    { name: "inventoryStore" },
  ),
);
