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
 *   session    : AppSession | null — null means the user is not authenticated
 *   isLoading  : boolean — true during the initial session hydration
 *   setSession : (session: AppSession) => void
 *   clearSession : () => void
 *
 * Development: The store is pre-loaded with a mock session.
 * Production:  The store starts null.  After /api/v1/global/auth/login returns
 *              a JWT, the auth flow calls setSession(hydrateRealSession(jwt)).
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
import { getMockSession } from "@/lib/auth/mock-session";

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
       * DEVELOPMENT: Pre-populate with a mock session so every page renders
       * immediately without an auth flow.
       *
       * PRODUCTION: Change this to `null` and initialize via setSession()
       * after the /auth/login API call succeeds.
       */
      session: getMockSession("premium_doctor"),

      isLoading: false,

      setSession: (session) => {
        set({ session, isLoading: false }, false, "setSession");
      },

      clearSession: () => {
        set({ session: null, isLoading: false }, false, "clearSession");
        // In production: clear cookies, redirect to /login
        // router.push('/login')
      },

      isExpired: () => {
        const { session } = get();
        if (!session) return true;
        return new Date() > session.expiresAt;
      },
    }),
    { name: "OptometryERP/Session" }
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
