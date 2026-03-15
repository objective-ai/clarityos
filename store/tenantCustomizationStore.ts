/**
 * store/tenantCustomizationStore.ts
 *
 * Zustand store for tenant-level visual customization.
 * Persisted to localStorage under "clarity-tenant-customization".
 *
 * Two customizable properties:
 *   - logoUrl   : data URL of the uploaded clinic logo (null = use default icon)
 *   - accentColor : hex string for the brand accent color (default: teal #2DD4BF)
 */

import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_ACCENT = "#2DD4BF";
export const DEFAULT_FONT_SIZE = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantCustomizationState {
  logoUrl: string | null;
  accentColor: string;
  fontSize: number;
  setLogo: (url: string | null) => void;
  setAccentColor: (hex: string) => void;
  setFontSize: (px: number) => void;
  resetToDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTenantCustomizationStore = create<TenantCustomizationState>()(
  devtools(
    persist(
      (set) => ({
        logoUrl: null,
        accentColor: DEFAULT_ACCENT,
        fontSize: DEFAULT_FONT_SIZE,

        setLogo: (url) => set({ logoUrl: url }, false, "setLogo"),

        setAccentColor: (hex) =>
          set({ accentColor: hex }, false, "setAccentColor"),

        setFontSize: (px) => set({ fontSize: px }, false, "setFontSize"),

        resetToDefaults: () =>
          set(
            { logoUrl: null, accentColor: DEFAULT_ACCENT, fontSize: DEFAULT_FONT_SIZE },
            false,
            "resetToDefaults"
          ),
      }),
      { name: "clarity-tenant-customization" }
    ),
    { name: "ClarityOS/TenantCustomization", enabled: isDev }
  )
);
