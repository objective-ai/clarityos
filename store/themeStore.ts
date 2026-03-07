/**
 * store/themeStore.ts
 *
 * Zustand store for theme preference (dark / light).
 *
 * Persisted to localStorage under "clarity-theme".
 */

import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemePreference = "dark" | "light";

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set) => ({
        theme: "light",
        setTheme: (theme) => set({ theme }, false, "setTheme"),
      }),
      { name: "clarity-theme" }
    ),
    { name: "ClarityOS/Theme", enabled: isDev }
  )
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Toggle between dark and light. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return current === "dark" ? "light" : "dark";
}
