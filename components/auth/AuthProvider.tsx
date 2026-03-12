"use client";

/**
 * components/auth/AuthProvider.tsx
 *
 * Listens to Supabase auth state changes and hydrates the sessionStore.
 * On mount: gets initial session. On auth events: updates or clears session.
 * Wraps tenant layout to ensure session is available to all child components.
 */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hydrateFromSupabaseSession } from "@/lib/auth/session-hydrator";
import { useSessionStore } from "@/store/sessionStore";
import { clearEphi } from "@/components/auth/LogoutButton";

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  useEffect(() => {
    const supabase = createClient();

    // Get initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        useSessionStore
          .getState()
          .setSession(hydrateFromSupabaseSession(session));
      } else {
        useSessionStore.setState({ isLoading: false });
      }
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        session
      ) {
        useSessionStore
          .getState()
          .setSession(hydrateFromSupabaseSession(session));
      } else if (event === "SIGNED_OUT") {
        clearEphi();
        useSessionStore.getState().clearSession();
        // Hard navigation to fully destroy all DOM (portals, overlays, etc.)
        window.location.href = "/login";
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
