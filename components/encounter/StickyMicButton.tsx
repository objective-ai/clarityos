"use client";

import { useState, useCallback } from "react";
import { Mic, Pause, Square } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MicState = "idle" | "recording" | "paused";

interface StickyMicButtonProps {
  encounterId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StickyMicButton({ encounterId: _encounterId }: StickyMicButtonProps) {
  const [micState, setMicState] = useState<MicState>("idle");

  // Tap cycles: idle -> recording, recording -> paused, paused -> recording
  const handleTap = useCallback(() => {
    setMicState((prev) =>
      prev === "idle" ? "recording" : prev === "recording" ? "paused" : "recording"
    );
  }, []);

  // Done: reset to idle and scroll to AI Scribe section at bottom of page
  const handleDone = useCallback(() => {
    setMicState("idle");
    const scribeSection = document.getElementById("ai-scribe-section");
    scribeSection?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-2"
      style={{ bottom: 128, right: 24 }}
    >
      {/* Done button — visible when recording or paused */}
      {micState !== "idle" && (
        <button
          type="button"
          onClick={handleDone}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
            bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--border-subtle)]
            text-[var(--text-primary)] shadow-lg hover-btn"
        >
          <Square size={12} />
          Done
        </button>
      )}

      {/* Main FAB */}
      <button
        type="button"
        onClick={handleTap}
        className={`
          w-14 h-14 rounded-full shadow-lg flex items-center justify-center
          transition-all duration-200 text-white
          ${
            micState === "recording"
              ? "bg-red-500 animate-pulse"
              : micState === "paused"
              ? "bg-amber-500"
              : "bg-[var(--accent)] hover:brightness-110"
          }
        `}
        aria-label={
          micState === "idle"
            ? "Start recording"
            : micState === "recording"
            ? "Pause recording"
            : "Resume recording"
        }
      >
        {micState === "paused" ? <Pause size={24} /> : <Mic size={24} />}
      </button>
    </div>
  );
}
