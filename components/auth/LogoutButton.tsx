"use client";

/**
 * components/auth/LogoutButton.tsx
 *
 * Logout button with ePHI cleanup. Clears all clinical data from
 * localStorage and resets clinical Zustand stores. Preserves
 * non-PHI preferences (theme, accent color).
 */

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useRefractionStore } from "@/store/refractionStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useProblemListStore } from "@/store/problemListStore";

/**
 * Clears all ePHI from the browser.
 * Exported so SessionTimeoutModal can reuse this on auto-logout.
 */
export function clearEphi() {
  // Clear ePHI localStorage keys (draft transcripts, encounter data, clinical state)
  if (typeof window !== "undefined") {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("draft-transcript-") ||
          key.startsWith("encounter-") ||
          key.startsWith("clinical-"))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  // Force-close any Radix Dialog portals still in the DOM.
  // Prevents orphaned black overlays when logout races with React state updates.
  if (typeof document !== "undefined") {
    document.querySelectorAll("[data-radix-portal]").forEach((el) => el.remove());
  }

  // Reset clinical Zustand stores to empty state
  // These stores contain ePHI and must be cleared on logout
  useEncounterStore.setState({ encounters: {}, finalizeModalOpen: false });
  useVitalsStore.setState({ encounters: {} });
  useRefractionStore.setState({
    columns: [],
    focusedCell: null,
    isReadOnly: false,
  });
  useExamFindingsStore.setState({ findings: {} });
  useDiagnosisStore.setState({ encounters: {} });
  useProblemListStore.setState({ patients: {} });

  // NOTE: themeStore and tenantCustomizationStore are NOT cleared (non-PHI)
}

interface LogoutButtonProps {
  className?: string;
  collapsed?: boolean;
}

export function LogoutButton({ className, collapsed }: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    // Sign out from Supabase
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear all ePHI
    clearEphi();

    // Clear session store
    useSessionStore.getState().clearSession();

    // Redirect to login
    router.push("/login");
  }

  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "sm"}
      onClick={handleLogout}
      className={className}
      title="Log out"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M10.5 11.5L14 8l-3.5-3.5M14 8H6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!collapsed && <span className="ml-2">Log Out</span>}
    </Button>
  );
}
