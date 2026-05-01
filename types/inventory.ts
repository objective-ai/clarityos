// Phase 13 — Retail Inventory types.
// Camel-cased on the wire (per backend CamelCaseModel); UUIDs as strings.
//
// IMPORTANT: attributes JSONB keys remain snake_case end-to-end (per
// feedback_camelizekeys_nested.md). DO NOT route Product.attributes
// through apiFetch's camelizeKeys — use raw fetch + getAuthHeaders()
// in inventoryStore.ts, mirroring fetchPatientInsurance.

export type ProductType = "frame" | "contact_lens";
export type Gender = "men" | "women" | "unisex" | "kids";
export type Material = "acetate" | "metal" | "titanium" | "other";
export type Modality = "daily" | "biweekly" | "monthly";
export type StockStatus = "in_stock" | "low" | "out" | "all";

export interface FrameAttributes {
  brand: string;
  model: string;
  color?: string;
  eye_size?: number;
  bridge_size?: number;
  temple_size?: number;
  gender?: Gender;
  material?: Material;
}

export interface ContactLensAttributes {
  brand: string;
  modality: Modality;
  base_curve?: number;
  diameter?: number;
  power?: number;
  cylinder?: number;
  axis?: number;
  box_size?: number;
}

export type ProductAttributes =
  | FrameAttributes
  | ContactLensAttributes
  | Record<string, unknown>;

export interface Product {
  id: string;
  tenantId: string;
  productType: ProductType;
  brand: string;
  model: string;
  sku: string;
  upc: string | null;
  attributes: ProductAttributes;
  retailPrice: string; // Decimal serialized as string by Pydantic
  costPrice: string | null;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreatePayload {
  productType: ProductType;
  brand: string;
  model: string;
  sku?: string;
  upc?: string | null;
  attributes: ProductAttributes;
  retailPrice: string | number;
  costPrice?: string | number | null;
  stockQty?: number;
  reorderThreshold?: number;
  isActive?: boolean;
}

export interface ProductUpdatePayload {
  brand?: string;
  model?: string;
  upc?: string | null;
  attributes?: ProductAttributes;
  retailPrice?: string | number;
  costPrice?: string | number | null;
  reorderThreshold?: number;
  isActive?: boolean;
}

export interface ReceiveStockPayload {
  qtyReceived: number;
  poReference?: string;
  note?: string;
}

export interface AdjustStockPayload {
  qtyDelta: number;
  reason?: "manual_adjust";
  note?: string;
}

export interface ProductFilters {
  productType?: ProductType;
  search?: string;
  stockStatus?: StockStatus;
  activeOnly?: boolean;
  gender?: Gender;
  modality?: Modality;
}

/** Derived helper: stock-status from stock_qty + reorder_threshold. */
export function deriveStockStatus(
  stockQty: number,
  reorderThreshold: number,
): "in_stock" | "low" | "out" {
  if (stockQty <= 0) return "out";
  if (stockQty <= reorderThreshold) return "low";
  return "in_stock";
}
