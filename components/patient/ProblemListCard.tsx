"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useProblemListStore,
  usePatientProblems,
  useProblemLoadStatus,
} from "@/store/problemListStore";
import type { ProblemStatus } from "@/types/patient-problem";
import type { EyeLaterality } from "@/types/diagnosis";

// ---------------------------------------------------------------------------
// Common ICD-10 codes (subset for quick add)
// ---------------------------------------------------------------------------

interface QuickCode {
  code: string;
  description: string;
}

const QUICK_CODES: QuickCode[] = [
  { code: "H52.13", description: "Myopia, bilateral" },
  { code: "H52.4", description: "Presbyopia" },
  { code: "H40.11X0", description: "Primary open-angle glaucoma" },
  { code: "H04.123", description: "Dry eye syndrome, bilateral" },
  { code: "H25.10", description: "Age-related nuclear cataract" },
  { code: "H35.30", description: "Macular degeneration" },
  { code: "E11.319", description: "Type 2 DM with diabetic retinopathy" },
];

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<ProblemStatus, "success" | "warning" | "secondary"> = {
  active: "warning",
  inactive: "secondary",
  resolved: "success",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProblemListCardProps {
  patientId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProblemListCard({ patientId }: ProblemListCardProps) {
  const store = useProblemListStore();
  const problems = usePatientProblems(patientId);
  const loadStatus = useProblemLoadStatus(patientId);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loadStatus === "idle") {
      store.fetchProblems(patientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleAdd = useCallback(
    async (code: QuickCode, eye: EyeLaterality | null) => {
      await store.addProblem(patientId, {
        icd10_code: code.code,
        description: code.description,
        eye_affected: eye,
      });
      setShowAdd(false);
      setSearch("");
    },
    [patientId, store],
  );

  const handleResolve = useCallback(
    async (problemId: string) => {
      await store.resolveProblem(patientId, problemId);
    },
    [patientId, store],
  );

  const handleDelete = useCallback(
    async (problemId: string) => {
      await store.deleteProblem(patientId, problemId);
    },
    [patientId, store],
  );

  const filtered = search.trim()
    ? QUICK_CODES.filter(
        (c) =>
          c.code.toLowerCase().includes(search.toLowerCase()) ||
          c.description.toLowerCase().includes(search.toLowerCase()),
      )
    : QUICK_CODES;

  const activeProblems = problems.filter((p) => p.status === "active");
  const resolvedProblems = problems.filter((p) => p.status === "resolved");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Problem List ({problems.length})</CardTitle>
        <Button
          variant={showAdd ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? "Close" : "+ Add Problem"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Quick add picker */}
        {showAdd && (
          <div className="border-b border-[var(--border-subtle)]">
            <div className="p-3">
              <input
                type="text"
                placeholder="Search ICD-10 codes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl text-xs glass-input"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.map((code, i) => (
                <div
                  key={code.code}
                  className={`flex items-center gap-3 px-4 py-2.5 hover-row ${
                    i > 0 ? "border-t border-[var(--border-subtle)]" : ""
                  }`}
                >
                  <span className="text-xs font-mono font-bold w-20 flex-shrink-0 text-[var(--accent)]">
                    {code.code}
                  </span>
                  <span className="flex-1 text-xs text-[var(--text-primary)]">
                    {code.description}
                  </span>
                  <div className="flex gap-1">
                    {(["OD", "OS", "OU"] as EyeLaterality[]).map((eye) => (
                      <button
                        key={eye}
                        type="button"
                        onClick={() => handleAdd(code, eye)}
                        className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg hover-laterality bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                      >
                        {eye}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAdd(code, null)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg hover-laterality bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-default)]"
                    >
                      N/A
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loadStatus === "loading" && (
          <div className="px-5 py-8 text-center text-caption text-[var(--text-muted)]">
            Loading problems...
          </div>
        )}

        {/* Empty state */}
        {loadStatus !== "loading" && problems.length === 0 && !showAdd && (
          <div className="px-5 py-8 text-center text-caption text-[var(--text-muted)]">
            No problems on record. Click &quot;+ Add Problem&quot; to start.
          </div>
        )}

        {/* Active problems */}
        {activeProblems.length > 0 && (
          <div>
            <div className="px-5 py-2 text-overline text-[var(--text-muted)] bg-[var(--bg-elevated)]">
              Active
            </div>
            {activeProblems.map((problem) => (
              <div
                key={problem.id}
                className="flex items-center gap-3 px-5 py-3 border-t border-[var(--border-subtle)]"
              >
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] flex-shrink-0">
                  {problem.icd10_code}
                </span>
                <span className="flex-1 text-xs text-[var(--text-primary)]">
                  {problem.description}
                </span>
                {problem.eye_affected && (
                  <span className="text-[10px] font-mono font-semibold text-[var(--text-muted)]">
                    {problem.eye_affected}
                  </span>
                )}
                <Badge variant={STATUS_VARIANT[problem.status as ProblemStatus] ?? "secondary"}>
                  {problem.status}
                </Badge>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleResolve(problem.id)}
                    className="text-[10px] px-2 py-1 rounded-lg text-[var(--state-normal)] hover:bg-[rgba(34,197,94,0.1)] transition-colors"
                    title="Mark resolved"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(problem.id)}
                    className="text-[10px] px-2 py-1 rounded-lg hover-danger text-[var(--text-muted)]"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resolved problems */}
        {resolvedProblems.length > 0 && (
          <div>
            <div className="px-5 py-2 text-overline text-[var(--text-muted)] bg-[var(--bg-elevated)]">
              Resolved
            </div>
            {resolvedProblems.map((problem) => (
              <div
                key={problem.id}
                className="flex items-center gap-3 px-5 py-3 border-t border-[var(--border-subtle)] opacity-60"
              >
                <span className="text-xs font-mono px-2 py-0.5 rounded-lg bg-[var(--bg-glass)] text-[var(--text-muted)] border border-[var(--glass-border)] flex-shrink-0">
                  {problem.icd10_code}
                </span>
                <span className="flex-1 text-xs text-[var(--text-secondary)] line-through">
                  {problem.description}
                </span>
                <Badge variant="success">resolved</Badge>
                {problem.resolved_date && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {problem.resolved_date}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
