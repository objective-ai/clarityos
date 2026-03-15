"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ExternalLink,
  FileDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/hooks/useEntitlements";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useBillingDashboardStore } from "@/store/billingDashboardStore";
import { usePayerStore } from "@/store/payerStore";
import { BillingWorkflowDialog } from "@/components/billing/BillingWorkflow";
import type { ClaimStatus, SuperbillListItem } from "@/types/billing";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ClaimStatus, { dot: string; label: string; description: string }> = {
  draft:         { dot: "#9CA3AF", label: "Draft",        description: "Not yet reviewed or posted" },
  ready_to_bill: { dot: "#2DD4BF", label: "Ready to Bill", description: "Posted — ready for claim submission" },
  submitted:     { dot: "#60A5FA", label: "Submitted",    description: "Claim submitted to payer" },
  accepted:      { dot: "#4ADE80", label: "Accepted",     description: "Claim accepted" },
  rejected:      { dot: "#FB7185", label: "Rejected",     description: "Claim rejected — review required" },
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      <span className="text-xs" style={{ color: cfg.dot }}>{cfg.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Age badge
// ---------------------------------------------------------------------------

function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  const color = days >= 30 ? "#FB7185" : days >= 14 ? "#FBBF24" : "var(--text-muted)";
  return (
    <span className="text-[10px]" style={{ color }}>
      {days === 0 ? "today" : `${days}d ago`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PDF download
// ---------------------------------------------------------------------------

async function downloadPdf(encounterId: string, setLoading: (v: boolean) => void) {
  setLoading(true);
  try {
    const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claim-${encounterId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Primary action button
// ---------------------------------------------------------------------------

function PrimaryAction({
  sb,
  onOpenWorkflow,
  onUpdateStatus,
  isUpdating,
}: {
  sb: SuperbillListItem;
  onOpenWorkflow: () => void;
  onUpdateStatus: (status: ClaimStatus) => void;
  isUpdating: boolean;
}) {
  const missingPayer = !sb.billedPayerId && !sb.isSelfPay;
  const missingIcd = sb.icdCodes.every((c) => !c) || sb.icdCodes.length === 0;
  const isDraftIncomplete = missingPayer || missingIcd;

  if (sb.claimStatus === "draft") {
    if (isDraftIncomplete) {
      return (
        <button
          onClick={onOpenWorkflow}
          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
          style={{ background: "rgba(251,191,36,0.1)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.3)" }}
          title="Missing payer or diagnosis codes"
        >
          <AlertTriangle size={11} />
          Finalize
        </button>
      );
    }
    return (
      <button
        onClick={() => onUpdateStatus("ready_to_bill")}
        disabled={isUpdating}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
        style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.3)" }}
      >
        {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
        Post
      </button>
    );
  }

  if (sb.claimStatus === "ready_to_bill") {
    return (
      <button
        onClick={() => onUpdateStatus("submitted")}
        disabled={isUpdating}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
        style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.3)" }}
      >
        {isUpdating ? <Loader2 size={11} className="animate-spin" /> : null}
        Submit
      </button>
    );
  }

  if (sb.claimStatus === "rejected") {
    return (
      <button
        onClick={onOpenWorkflow}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
        style={{ background: "rgba(251,113,133,0.1)", color: "#FB7185", border: "1px solid rgba(251,113,133,0.3)" }}
      >
        Review
      </button>
    );
  }

  // submitted / accepted — no primary action button
  return null;
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { label: string; value: ClaimStatus | "all" }[] = [
  { label: "All",          value: "all" },
  { label: "Draft",        value: "draft" },
  { label: "Ready to Bill", value: "ready_to_bill" },
  { label: "Submitted",    value: "submitted" },
  { label: "Accepted",     value: "accepted" },
  { label: "Rejected",     value: "rejected" },
];

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function downloadCsv(superbills: SuperbillListItem[]) {
  const posted = superbills.filter((sb) => sb.claimStatus === "ready_to_bill");
  const header = "Date,Patient,Provider,CPT Codes,Total Fee,Status";
  const rows = posted.map((sb) =>
    [
      new Date(sb.createdAt).toLocaleDateString(),
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

  const allSuperbills = useBillingDashboardStore((s) => s.superbills);
  const loading = useBillingDashboardStore((s) => s.loading);
  const error = useBillingDashboardStore((s) => s.error);
  const statusFilter = useBillingDashboardStore((s) => s.statusFilter);
  const fetchSuperbills = useBillingDashboardStore((s) => s.fetchSuperbills);
  const setStatusFilter = useBillingDashboardStore((s) => s.setStatusFilter);
  const updateClaimStatus = useBillingDashboardStore((s) => s.updateClaimStatus);

  const payers = usePayerStore((s) => s.payers);
  const loadPayers = usePayerStore((s) => s.loadPayers);

  const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [workflowSb, setWorkflowSb] = useState<SuperbillListItem | null>(null);

  useEffect(() => {
    fetchSuperbills();
    loadPayers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSubtitle(`${allSuperbills.length} superbill${allSuperbills.length !== 1 ? "s" : ""}`);
    return () => setSubtitle(null);
  }, [allSuperbills.length, setSubtitle]);

  // Client-side filter
  const superbills = useMemo(
    () => statusFilter === "all" ? allSuperbills : allSuperbills.filter((sb) => sb.claimStatus === statusFilter),
    [allSuperbills, statusFilter],
  );

  // Counts for filter tabs
  const counts = useMemo(() => ({
    all: allSuperbills.length,
    draft: allSuperbills.filter((s) => s.claimStatus === "draft").length,
    ready_to_bill: allSuperbills.filter((s) => s.claimStatus === "ready_to_bill").length,
    submitted: allSuperbills.filter((s) => s.claimStatus === "submitted").length,
    accepted: allSuperbills.filter((s) => s.claimStatus === "accepted").length,
    rejected: allSuperbills.filter((s) => s.claimStatus === "rejected").length,
  }), [allSuperbills]);

  async function handleUpdateStatus(sb: SuperbillListItem, newStatus: ClaimStatus) {
    setUpdatingId(sb.id);
    await updateClaimStatus(sb.encounterId, newStatus);
    setUpdatingId(null);
  }

  function resolvePayerName(sb: SuperbillListItem): string {
    if (sb.isSelfPay) return "Self-pay";
    if (!sb.billedPayerId) return "—";
    return payers.find((p) => p.id === sb.billedPayerId)?.name ?? "—";
  }

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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Filter tabs with counts */}
        <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
          {FILTER_OPTIONS.map((f) => {
            const count = counts[f.value];
            const isActive = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1 rounded-full min-w-[16px] text-center"
                    style={{
                      background: isActive ? "rgba(45,212,191,0.2)" : "var(--bg-surface)",
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Export */}
        <button
          type="button"
          onClick={() => downloadCsv(allSuperbills)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover-btn"
          style={{ background: "var(--bg-glass)", color: "var(--text-secondary)", border: "1px solid var(--glass-border)" }}
        >
          <FileDown size={12} />
          Export Posted (CSV)
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && allSuperbills.length === 0 && (
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
            <p className="text-subhead">No superbills{statusFilter !== "all" ? ` with status "${STATUS_CONFIG[statusFilter as ClaimStatus]?.label}"` : ""}</p>
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
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium w-24">Date</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Patient</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Payer</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">Codes</th>
                <th className="px-4 py-3 text-right text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium w-24">Total</th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium w-32">Status</th>
                <th className="px-4 py-3 w-28"></th>
                <th className="px-4 py-3 w-16"></th>
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
                  {/* Date + Age */}
                  <td className="px-4 py-3">
                    <div className="text-xs text-[var(--text-secondary)] font-medium">{formatDate(sb.createdAt)}</div>
                    <AgeBadge createdAt={sb.createdAt} />
                  </td>

                  {/* Patient */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/${tenant}/patients/${sb.patientId}`}
                      className="text-xs font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                    >
                      {sb.patientName}
                    </Link>
                    {sb.claimStatus === "rejected" && sb.rejectionReason && (
                      <p className="text-[10px] text-red-400 italic mt-0.5">{sb.rejectionReason}</p>
                    )}
                  </td>

                  {/* Payer */}
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                    {resolvePayerName(sb)}
                  </td>

                  {/* CPT + ICD chips */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {sb.cptCodes.map((code) => (
                        <Badge key={code} variant="outline" className="text-[10px] font-mono">
                          {code}
                        </Badge>
                      ))}
                      {sb.icdCodes.map((code) => (
                        <Badge
                          key={code}
                          variant="outline"
                          className="text-[10px] font-mono"
                          style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}
                        >
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-primary)]">
                    ${sb.totalFee.toFixed(2)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={sb.claimStatus} />
                  </td>

                  {/* Primary action */}
                  <td className="px-4 py-3">
                    <PrimaryAction
                      sb={sb}
                      onOpenWorkflow={() => setWorkflowSb(sb)}
                      onUpdateStatus={(status) => handleUpdateStatus(sb, status)}
                      isUpdating={updatingId === sb.id}
                    />
                  </td>

                  {/* Icon buttons */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/${tenant}/encounter/${sb.encounterId}`}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="View Encounter"
                      >
                        <ExternalLink size={14} />
                      </Link>
                      <button
                        onClick={() => downloadPdf(
                          sb.encounterId,
                          (v) => setPdfLoading((prev) => ({ ...prev, [sb.id]: v }))
                        )}
                        disabled={pdfLoading[sb.id]}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
                        title="Download PDF"
                      >
                        {pdfLoading[sb.id] ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FileDown size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* BillingWorkflow dialog */}
      {workflowSb && (
        <BillingWorkflowDialog
          open={!!workflowSb}
          onOpenChange={(v) => { if (!v) setWorkflowSb(null); }}
          encounterId={workflowSb.encounterId}
          patientId={workflowSb.patientId}
          patientName={workflowSb.patientName}
          providerName={workflowSb.providerName}
          onDone={() => { setWorkflowSb(null); fetchSuperbills(); }}
        />
      )}

      {/* Coming soon banner */}
      <div
        className="relative overflow-hidden rounded-2xl px-8 pt-12 pb-14 mt-8 mb-2 text-center"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--glass-border)", backdropFilter: "blur(12px)" }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: "linear-gradient(to bottom, #2DD4BF, #8B5CF6)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(45,212,191,0.07) 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.3)" }}>
              ⚡ COMING SOON
            </span>
          </div>
          <p className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>The future of billing is automated</p>
          <p className="text-sm leading-relaxed text-[var(--text-muted)] mb-6 max-w-lg mx-auto">
            Direct clearinghouse submission, ERA/EOB auto-posting, and denial management — all inside ClarityOS.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Direct Claim Submission", "ERA/EOB Auto-posting", "Denial Workflow"].map((pill) => (
              <span key={pill} className="text-[11px] font-medium px-2.5 py-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--glass-border)", color: "var(--text-secondary)" }}>
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
