"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ConflictSection } from "../conflict-resolver/buildConflicts";

const SECTION_META: Array<{ key: ConflictSection; label: string; short: string }> = [
  { key: "chief_complaint", label: "Chief Complaint", short: "CC" },
  { key: "vitals", label: "Vitals", short: "V" },
  { key: "exam_anterior", label: "Anterior", short: "Ant" },
  { key: "exam_posterior", label: "Posterior", short: "Post" },
  { key: "diagnoses", label: "Diagnoses", short: "Dx" },
  { key: "refraction", label: "Refraction", short: "Rx" },
  { key: "assessment", label: "Assessment & Plan", short: "A&P" },
];

interface QuickNavProps {
  /** Sections that have at least one suggestion row */
  activeSections: Set<ConflictSection>;
  /** ID of the scrollable container to observe */
  scrollContainerId: string;
}

export function QuickNav({ activeSections, scrollContainerId }: QuickNavProps) {
  const [activeSection, setActiveSection] = useState<ConflictSection | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Observe section headers inside the scrollable container
  useEffect(() => {
    const container = document.getElementById(scrollContainerId);
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const sectionKey = entry.target.getAttribute("data-section");
            if (sectionKey) setActiveSection(sectionKey as ConflictSection);
          }
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -80% 0px",
        threshold: 0,
      },
    );

    const headers = container.querySelectorAll("[data-section]");
    headers.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [scrollContainerId, activeSections]);

  const handleClick = useCallback(
    (sectionKey: ConflictSection) => {
      const container = document.getElementById(scrollContainerId);
      const el = container?.querySelector(`[data-section="${sectionKey}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollContainerId],
  );

  const visibleSections = SECTION_META.filter((s) => activeSections.has(s.key));
  if (visibleSections.length <= 1) return null;

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5">
      {visibleSections.map((s) => {
        const isActive = activeSection === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => handleClick(s.key)}
            title={s.label}
            className={`group relative flex items-center justify-center transition-all duration-200 ${
              isActive
                ? "w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-sm)]"
                : "w-6 h-6 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-glass)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
            }`}
          >
            <span className={`text-[9px] font-bold ${isActive ? "" : "text-[8px]"}`}>
              {s.short}
            </span>
            {/* Tooltip on hover */}
            <span className="absolute right-full mr-2 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--glass-border)] shadow-[var(--shadow-sm)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
