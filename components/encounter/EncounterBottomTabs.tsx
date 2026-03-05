"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquareText,
  HeartPulse,
  Glasses,
  Eye,
  Stethoscope,
  ClipboardList,
  Check,
  Lock,
} from "lucide-react";
import type { EncounterStatus } from "@/store/encounterStore";
import { PatientChartModal } from "@/components/PatientChartModal";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  sectionId: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "complaint",
    label: "Complaint",
    sectionId: "section-complaint",
    icon: <MessageSquareText size={16} />,
  },
  {
    id: "vitals",
    label: "Vitals",
    sectionId: "section-vitals",
    icon: <HeartPulse size={16} />,
  },
  {
    id: "rx",
    label: "Rx",
    sectionId: "section-rx",
    icon: <Glasses size={16} />,
  },
  {
    id: "exam",
    label: "Exam",
    sectionId: "section-exam",
    icon: <Eye size={16} />,
  },
  {
    id: "dx",
    label: "Dx",
    sectionId: "section-dx",
    icon: <Stethoscope size={16} />,
  },
  {
    id: "plan",
    label: "Plan",
    sectionId: "section-plan",
    icon: <ClipboardList size={16} />,
  },
];

// ---------------------------------------------------------------------------
// Status stepper constants
// ---------------------------------------------------------------------------

const STATUS_STEPS: { key: EncounterStatus; label: string }[] = [
  { key: "pre_test", label: "Pre-Test" },
  { key: "in_exam", label: "In Exam" },
  { key: "finalized", label: "Finalized" },
];

const STATUS_ORDER: Record<EncounterStatus, number> = {
  pre_test: 0,
  in_exam: 1,
  finalized: 2,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EncounterBottomTabsProps {
  status: EncounterStatus;
  isFinalized: boolean;
  onAdvanceStatus: () => void;
  sidebarCollapsed: boolean;
  patientId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EncounterBottomTabs({
  status,
  isFinalized,
  onAdvanceStatus,
  sidebarCollapsed,
  patientId,
}: EncounterBottomTabsProps) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [chartOpen, setChartOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentStep = STATUS_ORDER[status];

  // Track which section is in view
  useEffect(() => {
    const sections = TABS.map((t) => document.getElementById(t.sectionId)).filter(Boolean) as HTMLElement[];
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

  const actionLabel =
    status === "pre_test" ? "Start Exam" :
    status === "in_exam" ? "Finalize" :
    null;

  return (
    <>
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
      {/* Scroll-spy tabs */}
      <div className="flex items-center gap-0.5">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
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
              {tab.icon}
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Full Chart + Status stepper + action button */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Full Chart button */}
        <button
          type="button"
          onClick={() => setChartOpen(true)}
          className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium hover-btn bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
        >
          Full Chart
        </button>

        {/* Stepper */}
        <div className="hidden sm:flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => {
            const stepIndex = STATUS_ORDER[step.key];
            const isActive = stepIndex === currentStep;
            const isDone = stepIndex < currentStep;
            return (
              <div key={step.key} className="flex items-center gap-1">
                {i > 0 && (
                  <div
                    className="w-4 h-px"
                    style={{ background: isDone ? "var(--state-normal)" : "var(--border-default)" }}
                  />
                )}
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all"
                  style={
                    isActive
                      ? { background: "var(--accent-dim)", color: "var(--accent)", borderColor: "var(--accent)" }
                      : isDone
                      ? { background: "rgba(34,197,94,0.08)", color: "var(--state-normal)", borderColor: "rgba(34,197,94,0.2)" }
                      : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border-subtle)" }
                  }
                >
                  {isDone && <Check size={10} />}
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Action button */}
        {actionLabel ? (
          <button
            type="button"
            onClick={onAdvanceStatus}
            className="text-xs px-4 py-2 rounded-xl font-semibold transition-all bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
          >
            {actionLabel} &rarr;
          </button>
        ) : isFinalized ? (
          <span className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-medium text-[var(--text-muted)] bg-[var(--bg-glass)] border border-[var(--border-subtle)]">
            <Lock size={12} />
            Locked
          </span>
        ) : null}
      </div>
    </nav>

    <PatientChartModal patientId={patientId} open={chartOpen} onOpenChange={setChartOpen} />
    </>
  );
}
