// Phase 14 — Lens reference catalog store.
//
// Loads + caches the 3 admin-managed reference tables (lens types, materials,
// coatings) so configurator dropdowns hit the network at most once every
// CACHE_TTL_MS = 60s. Uses raw fetch + getAuthHeaders to stay consistent
// with the configurator store; the lens catalog payload itself is camelCase
// (CamelCaseModel on the BE) so apiFetch's camelizeKeys would be a no-op
// here, but raw fetch keeps the pattern uniform across Phase 14.

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { getAuthHeaders } from "@/lib/api-client";
import type {
  LensCoating,
  LensMaterial,
  LensType,
} from "@/types/lensCatalog";

interface LensCatalogState {
  lensTypes: LensType[];
  lensMaterials: LensMaterial[];
  lensCoatings: LensCoating[];
  loadedAt: number;
  loading: boolean;
  loadAll: (force?: boolean) => Promise<void>;
}

const CACHE_TTL_MS = 60_000;

export const useLensCatalogStore = create<LensCatalogState>()(
  devtools((set, get) => ({
    lensTypes: [],
    lensMaterials: [],
    lensCoatings: [],
    loadedAt: 0,
    loading: false,

    loadAll: async (force = false) => {
      if (
        !force &&
        Date.now() - get().loadedAt < CACHE_TTL_MS &&
        get().lensTypes.length > 0
      ) {
        return;
      }
      set({ loading: true });
      const headers = await getAuthHeaders();
      const [types, materials, coatings] = await Promise.all([
        fetch("/api/lens-catalog/types/", { headers }).then(
          (r) => r.json() as Promise<LensType[]>,
        ),
        fetch("/api/lens-catalog/materials/", { headers }).then(
          (r) => r.json() as Promise<LensMaterial[]>,
        ),
        fetch("/api/lens-catalog/coatings/", { headers }).then(
          (r) => r.json() as Promise<LensCoating[]>,
        ),
      ]);
      set({
        lensTypes: types,
        lensMaterials: materials,
        lensCoatings: coatings,
        loadedAt: Date.now(),
        loading: false,
      });
    },
  })),
);
