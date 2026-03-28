"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Scan, HeartPulse, Activity, Check } from "lucide-react";
import { useVitalsStore, useVitalsState } from "@/store/vitalsStore";
import type { VitalsDraft } from "@/types/vitals";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  sectionId: string;
  icon: React.ReactNode;
  isComplete: (draft: VitalsDraft | undefined) => boolean;
}

const TABS: TabDef[] = [
  {
    id: "va",
    label: "VA",
    sectionId: "section-pretest-va",
    icon: <Eye size={14} />,
    isComplete: (draft) =>
      !!(draft?.ucva_od && draft?.ucva_od.trim() !== "" &&
         draft?.ucva_os && draft?.ucva_os.trim() !== ""),
  },
  {
    id: "pupils",
    label: "Pupils",
    sectionId: "section-pretest-pupils",
    icon: <Scan size={14} />,
    isComplete: (draft) => draft?.pupils_equal_round_reactive != null,
  },
  {
    id: "instruments",
    label: "Instruments",
    sectionId: "section-pretest-instruments",
    icon: <HeartPulse size={14} />,
    isComplete: (draft) =>
      !!(draft?.iop_od != null && draft?.iop_os != null &&
         draft?.iop_od !== null && draft?.iop_os !== null),
  },
  {
    id: "systemic",
    label: "Systemic",
    sectionId: "section-pretest-systemic",
    icon: <Activity size={14} />,
    isComplete: (draft) =>
      !!(draft?.blood_pressure && draft?.blood_pressure.trim() !== ""),
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PreTestBottomBarProps {
  encounterId: string;
  sidebarCollapsed: boolean;
  onReadyForDoctor: () => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreTestBottomBar({
  encounterId,
  sidebarCollapsed,
  onReadyForDoctor,
}: PreTestBottomBarProps) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const vitalsState = useVitalsState(encounterId);
  const draft = vitalsState?.draft;
  const saveStatus = vitalsState?.saveStatus;

  const flushSave = useVitalsStore((s) => s.flushSave);

  const isSaving = saveStatus === "saving";

  // Scroll-spy: track which section is in view
  useEffect(() => {
    const sections = TABS.map((t) =>
      document.getElementById(t.sectionId)
    ).filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const tab = TABS.find((t) => t.sectionId === entry.target.id);
            if (tab) setActiveTab(tab.id);
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );

    sections.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleReadyForDoctor = async () => {
    flushSave(encounterId);
    await onReadyForDoctor();
  };

  return (
    <nav
      className="fixed bottom-0 right-0 z-30 flex items-center justify-between px-2 sm:px-4"
      style={{
        height: 48,
        left: sidebarCollapsed ? 60 : 220,
        background: "var(--bg-bottom-bar)",
        borderTop: "1px solid var(--border-default)",
        transition: "left 200ms var(--ease-out-expo)",
      }}
    >
      {/* Section tabs with scroll-spy + completion indicators */}
      <div className="flex items-center gap-0.5">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const complete = tab.isComplete(draft);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                scrollTo(tab.sectionId);
              }}
              className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg transition-colors"
              style={{
                minWidth: 44,
                minHeight: 44,
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                background: isActive ? "var(--accent-dim)" : "transparent",
              }}
            >
              {complete ? (
                <Check size={14} style={{ color: "var(--state-normal)" }} />
              ) : (
                tab.icon
              )}
              <span className="text-xs font-medium leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ready for Doctor button */}
      <div className="flex items-center flex-shrink-0">
        <button
          type="button"
          onClick={handleReadyForDoctor}
          disabled={isSaving}
          className={`text-xs px-4 py-2 rounded-xl font-semibold transition-all ${
            isSaving
              ? "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)] opacity-70 cursor-not-allowed"
              : "bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
          }`}
        >
          Ready for Doctor &rarr;
        </button>
      </div>
    </nav>
  );
}
