/**
 * store/pageHeaderStore.ts
 *
 * Micro-store for page subtitle displayed in TopNav.
 * Each page sets its subtitle on mount; TopNav reads it.
 */

import { create } from "zustand";

interface PageHeaderState {
  subtitle: string | null;
  setSubtitle: (subtitle: string | null) => void;
}

export const usePageHeaderStore = create<PageHeaderState>()((set) => ({
  subtitle: null,
  setSubtitle: (subtitle) => set({ subtitle }),
}));
