// Phase 13 — Optical Order types (thin primitive; Phase 14 will extend).
// Camel-cased on the wire (per backend CamelCaseModel); UUIDs as strings.
// Decimal values arrive as strings from Pydantic.

export type OrderStatus = "draft" | "placed" | "dispensed" | "cancelled";

export interface OpticalOrderLineItem {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
}

export interface OpticalOrder {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string | null;
  status: OrderStatus;
  totalPrice: string;
  createdById: string;
  placedAt: string | null;
  dispensedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: OpticalOrderLineItem[];
}

export interface OpticalOrderLineItemCreatePayload {
  productId: string;
  qty: number;
  unitPrice: string | number;
}

export interface OpticalOrderCreatePayload {
  patientId: string;
  encounterId?: string | null;
  lineItems: OpticalOrderLineItemCreatePayload[];
}

export interface OpticalOrderActionWarning {
  code: "zero_stock" | "low_stock";
  productId: string;
  message: string;
}

export interface OpticalOrderPlaceResponse {
  order: OpticalOrder;
  warnings: OpticalOrderActionWarning[];
}
