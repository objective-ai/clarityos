"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePatientStore } from "@/store/patientStore";

// ---------------------------------------------------------------------------
// PrepMeButton
// ---------------------------------------------------------------------------

interface PrepMeButtonProps {
  patientId: string;
}

export function PrepMeButton({ patientId }: PrepMeButtonProps) {
  const [showCard, setShowCard] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const summary = usePatientStore((s) => s.prepMeSummary);
  const loading = usePatientStore((s) => s.prepMeLoading);
  const fetchPrepMe = usePatientStore((s) => s.fetchPrepMe);
  const clearPrepMe = usePatientStore((s) => s.clearPrepMe);

  // Close card on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowCard(false);
      }
    }
    if (showCard) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCard]);

  const handleClick = async () => {
    if (showCard && summary) {
      // Toggle off
      setShowCard(false);
      clearPrepMe();
      return;
    }
    setShowCard(true);
    await fetchPrepMe(patientId);
  };

  return (
    <div className="relative" ref={cardRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        className="gap-2"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2a6 6 0 100 12A6 6 0 008 2z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M6 6.5a2 2 0 113.5 1.5c-.5.5-1 .8-1 1.5v.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle cx="8.5" cy="11.5" r="0.5" fill="currentColor" />
          </svg>
        )}
        Prep Me
      </Button>

      {showCard && (summary || loading) && (
        <Card className="absolute top-full mt-2 right-0 w-80 z-50 glass-card shadow-lg animate-enter">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-[var(--accent-dim)]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 1a6 6 0 100 12A6 6 0 007 1z"
                    stroke="var(--accent)"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M5 5.5a2 2 0 113.5 1.5c-.5.5-1 .8-1 1.5v.5"
                    stroke="var(--accent)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <circle cx="7.5" cy="10.5" r="0.5" fill="var(--accent)" />
                </svg>
              </div>
              <p className="text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                AI Pre-Visit Summary
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <p className="text-body text-[var(--text-secondary)]">
                  Reading clinical history...
                </p>
              </div>
            ) : summary ? (
              <p className="text-body text-[var(--text-primary)] leading-relaxed">
                {summary}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
