"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useProblemListStore,
  useActiveProblems,
  useProblemLoadStatus,
} from "@/store/problemListStore";
import { useDiagnosisStore, useDiagnoses } from "@/store/diagnosisStore";
import type { PatientProblem } from "@/types/patient-problem";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContinuitySidebarProps {
  patientId: string;
  encounterId: string;
  isReadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContinuitySidebar({
  patientId,
  encounterId,
  isReadOnly = false,
}: ContinuitySidebarProps) {
  const store = useProblemListStore();
  const diagnosisStore = useDiagnosisStore();
  const problems = useActiveProblems(patientId);
  const existingDiagnoses = useDiagnoses(encounterId);
  const loadStatus = useProblemLoadStatus(patientId);
  const [collapsed, setCollapsed] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => {
    if (loadStatus === "idle") {
      store.fetchProblems(patientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handlePromote = useCallback(
    async (problem: PatientProblem) => {
      if (isReadOnly || promotingId) return;

      // Deduplication: check if ICD-10 code already exists in encounter diagnoses
      const alreadyExists = existingDiagnoses.some(
        (dx) => dx.icd10_code === problem.icd10_code,
      );
      if (alreadyExists) return; // silently skip duplicate

      setPromotingId(problem.id);

      const dx = await store.promoteToDiagnosis(encounterId, problem.id);
      if (dx) {
        // Add to local diagnosis store so it appears immediately
        diagnosisStore._addLocal(encounterId, dx);
      }

      setPromotingId(null);
    },
    [encounterId, isReadOnly, promotingId, existingDiagnoses, store, diagnosisStore],
  );

  if (problems.length === 0 && loadStatus !== "loading") return null;

  return (
    <div className="rounded-xl overflow-hidden bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-5 py-3 hover-row transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-overline text-[var(--text-primary)]">
            Active Problems
          </span>
          <Badge variant="secondary">{problems.length}</Badge>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`transition-transform text-[var(--text-muted)] ${
            collapsed ? "" : "rotate-180"
          }`}
        >
          <path
            d="M3 5.5L7 9.5L11 5.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Problem list */}
      {!collapsed && (
        <div className="border-t border-[var(--border-subtle)]">
          {loadStatus === "loading" ? (
            <div className="px-5 py-6 text-center text-caption text-[var(--text-muted)]">
              Loading problems...
            </div>
          ) : (
            problems.map((problem, i) => (
              <div
                key={problem.id}
                className={`flex items-center gap-3 px-5 py-2.5 ${
                  i > 0 ? "border-t border-[var(--border-subtle)]" : ""
                }`}
              >
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] flex-shrink-0">
                  {problem.icd10_code}
                </span>
                <span className="flex-1 text-xs text-[var(--text-primary)] truncate">
                  {problem.description}
                </span>
                {problem.eye_affected && (
                  <span className="text-[10px] font-mono font-semibold text-[var(--text-muted)]">
                    {problem.eye_affected}
                  </span>
                )}
                {!isReadOnly && (() => {
                  const isDuplicate = existingDiagnoses.some(
                    (dx) => dx.icd10_code === problem.icd10_code,
                  );
                  return isDuplicate ? (
                    <span className="text-[10px] text-[var(--text-muted)] px-2">Added</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePromote(problem)}
                      disabled={promotingId === problem.id}
                      className="text-[11px] h-7 px-2.5"
                    >
                      {promotingId === problem.id ? "..." : "Bring Forward"}
                    </Button>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
