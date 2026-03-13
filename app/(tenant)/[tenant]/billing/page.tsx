"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/hooks/useEntitlements";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useBillingDashboardStore } from "@/store/billingDashboardStore";
import type { ClaimStatus, SuperbillListItem } from "@/types/billing";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Status badge styling
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft:         { bg: "rgba(156,163,175,0.10)", text: "#9CA3AF", border: "rgba(156,163,175,0.25)", label: "Draft" },
  ready_to_bill: { bg: "rgba(45,212,191,0.10)",  text: "#2DD4BF", border: "rgba(45,212,191,0.25)",  label: "Posted" },
  submitted:     { bg: "rgba(96,165,250,0.10)",  text: "#60A5FA", border: "rgba(96,165,250,0.25)",  label: "Submitted" },
  accepted:      { bg: "rgba(74,222,128,0.10)",  text: "#4ADE80", border: "rgba(74,222,128,0.25)",  label: "Accepted" },
  rejected:      { bg: "rgba(251,113,133,0.10)", text: "#FB7185", border: "rgba(251,113,133,0.25)", label: "Rejected" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <Badge
      className="text-[10px]"
      style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
    >
      {style.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTERS: { label: string; value: ClaimStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Posted", value: "ready_to_bill" },
];

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function downloadCsv(superbills: SuperbillListItem[]) {
  const posted = superbills.filter((sb) => sb.claimStatus === "ready_to_bill");
  const header = "Date,Patient,Provider,CPT Codes,Total Fee,Status";
  const rows = posted.map((sb) =>
    [
      formatClinicDate(sb.createdAt),
      `"${sb.patientName}"`,
      `"${sb.providerName}"`,
      `"${sb.cptCodes.join(", ")}"`,
      sb.totalFee.toFixed(2),
      sb.claimStatus,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `superbills-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const { requireRole } = useEntitlements();
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  const superbills = useBillingDashboardStore((s) => s.superbills);
  const loading = useBillingDashboardStore((s) => s.loading);
  const error = useBillingDashboardStore((s) => s.error);
  const statusFilter = useBillingDashboardStore((s) => s.statusFilter);
  const fetchSuperbills = useBillingDashboardStore((s) => s.fetchSuperbills);
  const setStatusFilter = useBillingDashboardStore((s) => s.setStatusFilter);

  // Initial load
  useEffect(() => {
    fetchSuperbills();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subtitle
  useEffect(() => {
    setSubtitle(`${superbills.length} superbill${superbills.length !== 1 ? "s" : ""}`);
    return () => setSubtitle(null);
  }, [superbills.length, setSubtitle]);

  // Role gate
  if (!requireRole("doctor", "admin", "owner")) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <h2 className="text-subhead mb-2">Access Restricted</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Billing is only available to doctors, admins, and owners.
          </p>
        </div>
      </div>
    );
  }

  function formatDate(dateStr: string) {
    return formatClinicDate(dateStr);
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: statusFilter === f.value ? "var(--accent-dim)" : "transparent",
                color: statusFilter === f.value ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Export */}
        <button
          type="button"
          onClick={() => downloadCsv(superbills)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover-btn"
          style={{
            background: "var(--bg-glass)",
            color: "var(--text-secondary)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <Download size={12} />
          Export Posted Claims (CSV)
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && superbills.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-body">Loading superbills...</span>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && superbills.length === 0 && !error && (
        <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="2.5" width="14" height="15" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M7 7h6M7 10h4M7 13h5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">No superbills yet</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              Superbills are created when encounters are finalized.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {superbills.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Date</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Patient</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Provider</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">CPT Codes</th>
                <th className="px-4 py-3 text-right text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Total</th>
                <th className="px-4 py-3 text-center text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {superbills.map((sb, idx) => (
                <tr
                  key={sb.id}
                  className={`border-b border-[var(--border-subtle)] last:border-b-0 ${
                    idx % 2 === 0 ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-elevated)]"
                  } hover:bg-[var(--accent-dim)] transition-colors`}
                >
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {formatDate(sb.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${tenant}/patients/${sb.patientId}`}
                      className="text-body font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                    >
                      {sb.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {sb.providerName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {sb.cptCodes.map((code) => (
                        <Badge key={code} variant="outline" className="text-[10px] font-mono">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-primary)]">
                    ${sb.totalFee.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={sb.claimStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
