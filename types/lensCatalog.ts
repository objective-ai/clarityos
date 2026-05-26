// Phase 14 — Lens Reference Catalog TS types.
// Camel-cased on the wire (backend CamelCaseModel); Decimal as string per
// Phase 13-03 convention.

export interface LensType {
  id: string;
  tenantId: string;
  name: string;
  requiresSegHeight: boolean;
  requiresVertex: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LensMaterial {
  id: string;
  tenantId: string;
  name: string;
  refractiveIndex: string | null;
  abbeValue: number | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LensCoatingCategory = "treatment" | "tint" | "finish";

export interface LensCoating {
  id: string;
  tenantId: string;
  name: string;
  category: LensCoatingCategory | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
