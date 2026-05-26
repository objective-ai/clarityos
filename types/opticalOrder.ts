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
  // Phase 14 — per-line lens configuration. Record<string, any> preserves
  // snake_case JSONB nested keys (Pitfall 1: apiFetch's recursive camelize
  // would mangle them; configurator store uses raw fetch instead).
  lensConfig: Record<string, any> | null;
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
  // Phase 14 — configurator extensions. All JSONB columns typed as
  // Record<string, any> so snake_case nested keys survive the wire trip
  // unchanged (Pitfall 1).
  visionPlan: Record<string, any>;
  fitting: Record<string, any>;
  suggestionResolutions: Record<string, any>;
  finalRefractionId: string | null;
  habitualRefractionId: string | null;
  jobTicketGeneratedAt: string | null;
}

// Phase 14 — configurator autosave PATCH payload.
// Every field optional so the store can send single-field deltas.
export interface PatchOpticalOrderRequest {
  visionPlan?: Record<string, any>;
  fitting?: Record<string, any>;
  lineItems?: Array<{ id: string; lensConfig?: Record<string, any> }>;
  finalRefractionId?: string | null;
  habitualRefractionId?: string | null;
}

// Phase 14 — AI Scribe extracted suggestion.
export interface ExtractedSuggestion {
  field: "lens_type" | "material" | "coatings";
  value: string | string[];
  matched: string[];
}

export interface OpticalSuggestionsListResponse {
  suggestions: ExtractedSuggestion[];
  rationale: string;
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
