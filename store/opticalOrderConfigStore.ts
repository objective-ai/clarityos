// Phase 14 — Optical Order Configurator store.
//
// IMPORTANT: We use raw `fetch + getAuthHeaders()` — NOT `apiFetch`. Per
// feedback_camelizekeys_nested.md / Pitfall 1, apiFetch recursively
// camelizes every key it sees, which would mangle snake_case JSONB nested
// keys like `pd_distance`, `seg_height_od`, `vision_plan_jsonb.member_id`.
// The configurator must round-trip those keys verbatim.
//
// Autosave: 1.5s debounce + flush-on-blur (mirrors refractionStore). The
// debounce timer resets on every patch*; flush() clears the pending timer
// and PATCHes the accumulated diff. flush() short-circuits when
// draft.status !== "draft" (Pitfall 11 — backend would 409 anyway).

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { getAuthHeaders } from "@/lib/api-client";
import type {
  ExtractedSuggestion,
  OpticalOrder,
  OpticalOrderLineItem,
  OpticalSuggestionsListResponse,
  PatchOpticalOrderRequest,
} from "@/types/opticalOrder";

type DirtyField =
  | "vision_plan"
  | "fitting"
  | "line_items"
  | "final_refraction_id"
  | "habitual_refraction_id";

interface OpticalOrderConfigState {
  draft: OpticalOrder | null;
  committed: OpticalOrder | null;
  dirty: Set<DirtyField>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  loading: boolean;
  saving: boolean;
  suggestions: ExtractedSuggestion[];
  suggestionsRationale: string;

  load: (orderId: string) => Promise<void>;
  patchVisionPlan: (next: Record<string, any>) => void;
  patchFitting: (next: Record<string, any>) => void;
  patchLineItemLensConfig: (
    lineId: string,
    next: Record<string, any>,
  ) => void;
  patchRefractionId: (
    kind: "final" | "habitual",
    id: string | null,
  ) => void;
  flush: () => Promise<void>;

  loadSuggestions: () => Promise<void>;
  acceptSuggestion: (field: string) => Promise<void>;
  dismissSuggestion: (field: string) => Promise<void>;

  reset: () => void;
}

const DEBOUNCE_MS = 1500;

export const useOpticalOrderConfigStore = create<OpticalOrderConfigState>()(
  devtools((set, get) => ({
    draft: null,
    committed: null,
    dirty: new Set<DirtyField>(),
    saveTimer: null,
    loading: false,
    saving: false,
    suggestions: [],
    suggestionsRationale: "",

    load: async (orderId) => {
      set({ loading: true });
      const headers = await getAuthHeaders();
      const resp = await fetch(`/api/optical-orders/${orderId}/`, {
        headers,
      });
      if (!resp.ok) {
        set({ loading: false });
        throw new Error(`load failed: ${resp.status}`);
      }
      const order = (await resp.json()) as OpticalOrder;
      set({
        draft: order,
        committed: order,
        dirty: new Set(),
        loading: false,
      });
    },

    patchVisionPlan: (next) => {
      const draft = get().draft;
      if (!draft) return;
      const dirty = new Set(get().dirty);
      dirty.add("vision_plan");
      set({ draft: { ...draft, visionPlan: next }, dirty });
      _scheduleFlush(set, get);
    },

    patchFitting: (next) => {
      const draft = get().draft;
      if (!draft) return;
      const dirty = new Set(get().dirty);
      dirty.add("fitting");
      set({ draft: { ...draft, fitting: next }, dirty });
      _scheduleFlush(set, get);
    },

    patchLineItemLensConfig: (lineId, next) => {
      const draft = get().draft;
      if (!draft) return;
      const updated = draft.lineItems.map((li: OpticalOrderLineItem) =>
        li.id === lineId ? { ...li, lensConfig: next } : li,
      );
      const dirty = new Set(get().dirty);
      dirty.add("line_items");
      set({ draft: { ...draft, lineItems: updated }, dirty });
      _scheduleFlush(set, get);
    },

    patchRefractionId: (kind, id) => {
      const draft = get().draft;
      if (!draft) return;
      const field: DirtyField =
        kind === "final" ? "final_refraction_id" : "habitual_refraction_id";
      const key =
        kind === "final" ? "finalRefractionId" : "habitualRefractionId";
      const dirty = new Set(get().dirty);
      dirty.add(field);
      set({ draft: { ...draft, [key]: id } as OpticalOrder, dirty });
      _scheduleFlush(set, get);
    },

    flush: async () => {
      const { draft, dirty, saveTimer } = get();
      if (saveTimer) {
        clearTimeout(saveTimer);
        set({ saveTimer: null });
      }
      if (!draft) return;
      // Pitfall 11: backend will 409 on non-draft; short-circuit FE-side.
      if (draft.status !== "draft") return;
      if (dirty.size === 0) return;

      const payload: PatchOpticalOrderRequest = {};
      if (dirty.has("vision_plan")) payload.visionPlan = draft.visionPlan;
      if (dirty.has("fitting")) payload.fitting = draft.fitting;
      if (dirty.has("line_items")) {
        payload.lineItems = draft.lineItems.map((li) => ({
          id: li.id,
          lensConfig: li.lensConfig ?? undefined,
        }));
      }
      if (dirty.has("final_refraction_id")) {
        payload.finalRefractionId = draft.finalRefractionId;
      }
      if (dirty.has("habitual_refraction_id")) {
        payload.habitualRefractionId = draft.habitualRefractionId;
      }

      set({ saving: true });
      const headers = {
        ...(await getAuthHeaders()),
        "Content-Type": "application/json",
      };
      const resp = await fetch(`/api/optical-orders/${draft.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        set({ saving: false });
        throw new Error(`flush failed: ${resp.status}`);
      }
      const updated = (await resp.json()) as OpticalOrder;
      set({
        draft: updated,
        committed: updated,
        dirty: new Set(),
        saving: false,
      });
    },

    loadSuggestions: async () => {
      const { draft } = get();
      if (!draft) return;
      const headers = await getAuthHeaders();
      const resp = await fetch(
        `/api/optical-orders/${draft.id}/suggestions/`,
        { headers },
      );
      if (!resp.ok) return;
      const data = (await resp.json()) as OpticalSuggestionsListResponse;
      set({
        suggestions: data.suggestions,
        suggestionsRationale: data.rationale,
      });
    },

    acceptSuggestion: async (field) => {
      const { draft } = get();
      if (!draft) return;
      const headers = await getAuthHeaders();
      await fetch(
        `/api/optical-orders/${draft.id}/suggestions/${field}/accept/`,
        { method: "POST", headers },
      );
      await get().loadSuggestions();
      await get().load(draft.id);
    },

    dismissSuggestion: async (field) => {
      const { draft } = get();
      if (!draft) return;
      const headers = await getAuthHeaders();
      await fetch(
        `/api/optical-orders/${draft.id}/suggestions/${field}/dismiss/`,
        { method: "POST", headers },
      );
      await get().loadSuggestions();
    },

    reset: () =>
      set({
        draft: null,
        committed: null,
        dirty: new Set(),
        saveTimer: null,
        suggestions: [],
        suggestionsRationale: "",
      }),
  })),
);

function _scheduleFlush(set: any, get: any) {
  const prev = get().saveTimer;
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    get()
      .flush()
      .catch(console.error);
  }, DEBOUNCE_MS);
  set({ saveTimer: timer });
}
