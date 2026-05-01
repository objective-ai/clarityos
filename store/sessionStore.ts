/**
 * store/sessionStore.ts
 *
 * Zustand store for the authenticated session.
 *
 * This is the single source of truth for auth state on the frontend.
 * All components that need to know who the user is or what they can access
 * read from this store via the useSession() selector or the useEntitlements() hook.
 *
 * Store shape:
 *   session    : AppSession | null -- null means the user is not authenticated
 *   isLoading  : boolean -- true during the initial session hydration
 *   setSession : (session: AppSession) => void
 *   clearSession : () => void
 *
 * The store starts null with isLoading: true. AuthProvider hydrates it from
 * Supabase Auth on mount via onAuthStateChange.
 *
 * Why Zustand instead of Context?
 *   - No Provider wrapper around the entire tree (no re-render cascade on login)
 *   - Selectors are O(1) and only re-render subscribed components
 *   - Store state survives route transitions (important for the 20-min exam flow)
 *   - DevTools integration for debugging session state during development
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AppSession } from "@/types/session";

const isDev = process.env.NODE_ENV === "development";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SessionState {
  session: AppSession | null;
  isLoading: boolean;
  /** Called after successful login with the hydrated session */
  setSession: (session: AppSession) => void;
  /** Called on logout or session expiry */
  clearSession: () => void;
  /** Check if the current session has expired */
  isExpired: () => boolean;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      /**
       * Starts null -- hydrated from Supabase Auth via AuthProvider.
       * isLoading is true until the auth state listener resolves.
       */
      session: null,

      isLoading: true,

      setSession: (session) => {
        set({ session, isLoading: false }, false, "setSession");
      },

      clearSession: () => {
        set({ session: null, isLoading: false }, false, "clearSession");
      },

      isExpired: () => {
        const { session } = get();
        if (!session) return true;
        return new Date() > session.expiresAt;
      },
    }),
    { name: "ClarityOS/Session", enabled: isDev }
  )
);

// ---------------------------------------------------------------------------
// Selector hooks (avoids re-renders when unrelated state changes)
// ---------------------------------------------------------------------------

/** Returns the full session or null */
export const useSession = () => useSessionStore((s) => s.session);

/** Returns the user object or null */
export const useCurrentUser = () => useSessionStore((s) => s.session?.user ?? null);

/** Returns the tenant context or null */
export const useCurrentTenant = () => useSessionStore((s) => s.session?.tenant ?? null);

// Dev/test only — expose on window so Playwright specs can read/mutate the
// live store (e.g., strip an entitlement to assert UI gating). Stripped from
// production builds via the isDev guard.
if (isDev && typeof window !== "undefined") {
  (window as unknown as { __SESSION_STORE__?: typeof useSessionStore }).__SESSION_STORE__ = useSessionStore;
}
