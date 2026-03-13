"use client";

/**
 * components/auth/SessionTimeoutModal.tsx
 *
 * HIPAA-compliant inactivity timeout.
 * - 28 minutes idle: shows warning modal with countdown
 * - 30 minutes idle: auto-logout with ePHI cleanup
 *
 * Uses react-idle-timer for cross-tab idle detection.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useIdleTimer } from "react-idle-timer";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/sessionStore";
import { clearEphi } from "@/components/auth/LogoutButton";
import { Button } from "@/components/ui/button";

const WARNING_TIMEOUT_MS = 28 * 60 * 1000; // 28 minutes
const COUNTDOWN_SECONDS = 120; // 2 minutes between warning and logout

export function SessionTimeoutModal() {
  const session = useSessionStore((s) => s.session);
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLogout = useCallback(async () => {
    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setShowWarning(false);

    // Sign out
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear ePHI
    clearEphi();

    // Clear session store
    useSessionStore.getState().clearSession();

    // Hard navigation to fully destroy all DOM (portals, overlays, etc.)
    // Using window.location instead of router.push ensures complete teardown,
    // especially when the tab is in the background and React updates are throttled.
    window.location.href = "/login";
  }, []);

  // Warning timer: fires at 28 minutes of inactivity
  const { reset: resetWarning } = useIdleTimer({
    timeout: WARNING_TIMEOUT_MS,
    onIdle: () => {
      if (!session) return; // Don't show if not logged in
      setShowWarning(true);
      setCountdown(COUNTDOWN_SECONDS);

      // Start countdown
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Time's up -- auto-logout
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    disabled: !session,
    crossTab: true,
    debounce: 500,
  });

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleStayLoggedIn = useCallback(() => {
    // Clear countdown
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setShowWarning(false);
    setCountdown(COUNTDOWN_SECONDS);
    resetWarning();
  }, [resetWarning]);

  // Don't render anything if not logged in or no warning
  if (!session || !showWarning) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative glass-card p-8 max-w-sm w-full mx-4 animate-enter text-center">
        {/* Warning icon */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 bg-[var(--state-warning)]/10 border border-[var(--state-warning)]/30">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--state-warning)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="text-heading text-[var(--text-primary)] mb-2">
          Session Expiring
        </h2>

        <p className="text-body text-[var(--text-secondary)] mb-6">
          Your session will expire in{" "}
          <span className="font-mono font-bold text-[var(--state-warning)]">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>{" "}
          due to inactivity.
        </p>

        <Button onClick={handleStayLoggedIn} className="w-full">
          Stay Logged In
        </Button>
      </div>
    </div>
  );
}
