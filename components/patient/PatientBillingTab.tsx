"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PatientSuperbillSummary } from "@/types/billing";

// ---------------------------------------------------------------------------
// Status Styles (copied inline — do NOT import from billing page)
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  draft: {
    bg: "bg-gray-500/20",
    text: "text-gray-300",
    border: "border-gray-500/30",
    label: "Draft",
  },
  ready_to_bill: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-300",
    border: "border-yellow-500/30",
    label: "Ready to Bill",
  },
  submitted: {
    bg: "bg-blue-500/20",
    text: "text-blue-300",
    border: "border-blue-500/30",
    label: "Submitted",
  },
  accepted: {
    bg: "bg-green-500/20",
    text: "text-green-300",
    border: "border-green-500/30",
    label: "Accepted",
  },
  rejected: {
    bg: "bg-red-500/20",
    text: "text-red-300",
    border: "border-red-500/30",
    label: "Rejected",
  },
};

// ---------------------------------------------------------------------------
// PatientBillingTab Component
// ---------------------------------------------------------------------------

export function PatientBillingTab({ patientId }: { patientId: string }) {
  const [superbills, setSuperbills] = useState<PatientSuperbillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuperbills = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/superbills`);
      if (!res.ok) throw new Error("Failed to load billing records");
      const data = await res.json();
      setSuperbills(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperbills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  return (
    <div className="space-y-4">
      <h2 className="text-subhead">Billing History</h2>

      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-body text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={fetchSuperbills}>
              Retry
            </Button>
          </div>
        ) : superbills.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left text-caption text-[var(--text-muted)] px-4 py-3 font-medium">
                  Date
                </th>
                <th className="text-left text-caption text-[var(--text-muted)] px-4 py-3 font-medium">
                  Status
                </th>
                <th className="text-left text-caption text-[var(--text-muted)] px-4 py-3 font-medium">
                  E&amp;M Code
                </th>
                <th className="text-left text-caption text-[var(--text-muted)] px-4 py-3 font-medium">
                  CPT Codes
                </th>
                <th className="text-right text-caption text-[var(--text-muted)] px-4 py-3 font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {superbills.map((sb) => (
                <SuperbillRow key={sb.id} superbill={sb} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Superbill Row
// ---------------------------------------------------------------------------

function SuperbillRow({ superbill }: { superbill: PatientSuperbillSummary }) {
  const style = STATUS_STYLES[superbill.claim_status] ?? STATUS_STYLES.draft;

  const formattedDate = (() => {
    if (!superbill.encounter_date) return "--";
    const d = new Date(superbill.encounter_date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  })();

  const emCode =
    superbill.suggested_em_code || superbill.mdm_level || "--";

  const cptList =
    superbill.cpt_codes.length > 0
      ? superbill.cpt_codes.join(", ")
      : "--";

  return (
    <tr className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-body text-[var(--text-primary)]">
        {formattedDate}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium border ${style.bg} ${style.text} ${style.border}`}
        >
          {style.label}
        </span>
      </td>
      <td className="px-4 py-3 text-body text-[var(--text-secondary)]">
        {emCode}
      </td>
      <td className="px-4 py-3 text-body text-[var(--text-secondary)]">
        {cptList}
      </td>
      <td className="px-4 py-3 text-body text-[var(--text-primary)] text-right">
        ${superbill.total_fee.toFixed(2)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-24" />
          <div className="h-5 bg-white/10 rounded w-20" />
          <div className="h-4 bg-white/10 rounded w-16" />
          <div className="h-4 bg-white/10 rounded flex-1" />
          <div className="h-4 bg-white/10 rounded w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        className="text-[var(--text-muted)] opacity-40"
      >
        <rect
          x="6"
          y="8"
          width="28"
          height="24"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 16h16M12 22h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-body text-[var(--text-muted)]">No superbills on file</p>
    </div>
  );
}
