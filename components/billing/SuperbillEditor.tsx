"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, Zap, Lock, FileDown, Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBillingStore } from "@/store/billingStore";
import { CPT_CATALOG } from "@/types/billing";
import type { CptEntry, MdmLevel, PatientInsurance } from "@/types/billing";
import { PayerSelectionModal } from "@/components/billing/PayerSelectionModal";

// ---------------------------------------------------------------------------
// MDM level colour map
// ---------------------------------------------------------------------------

const MDM_COLORS: Record<MdmLevel, string> = {
  straightforward: "#2DD4BF",
  low: "#60A5FA",
  moderate: "#FBBF24",
  high: "#FB7185",
};

// ---------------------------------------------------------------------------
// CptAddDropdown — inline sub-component
// ---------------------------------------------------------------------------

function CptAddDropdown({
  encounterId,
  existingCodes,
}: {
  encounterId: string;
  existingCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addLineItem = useBillingStore((s) => s.addLineItem);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = CPT_CATALOG.filter(
    (c: CptEntry) =>
      !existingCodes.includes(c.code) &&
      (c.code.includes(search) ||
        c.description.toLowerCase().includes(search.toLowerCase())),
  );

  const handleSelect = async (entry: CptEntry) => {
    await addLineItem(encounterId, {
      cptCode: entry.code,
      description: entry.description,
      fee: entry.defaultFee,
      units: 1,
    });
    setOpen(false);
    setSearch("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium
          bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--glass-border)]
          hover:bg-[var(--accent)]/20 transition-colors"
      >
        <Plus size={14} />
        Add CPT
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        placeholder="Search CPT code or description..."
        className="glass-input w-64 text-sm"
      />

      {filtered.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-80 max-h-56 overflow-y-auto rounded-lg
            border border-[var(--glass-border)] bg-[var(--bg-elevated)] shadow-xl"
        >
          {filtered.map((entry) => (
            <li key={entry.code}>
              <button
                type="button"
                onClick={() => handleSelect(entry)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                  hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="font-mono text-[var(--accent)]">
                  {entry.code}
                </span>
                <span className="flex-1 truncate text-[var(--text-secondary)]">
                  {entry.description}
                </span>
                <span className="text-[var(--text-muted)]">
                  ${entry.defaultFee.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtered.length === 0 && search && (
        <div
          className="absolute z-50 mt-1 w-80 rounded-lg border border-[var(--glass-border)]
            bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]"
        >
          No matching CPT codes
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuperbillEditor — main component
// ---------------------------------------------------------------------------

export default function SuperbillEditor({
  encounterId,
  patientId,
}: {
  encounterId: string;
  patientId: string;
}) {
  const slice = useBillingStore(
    (s) => s.encounters[encounterId] ?? null,
  );
  const loadSuperbill = useBillingStore((s) => s.loadSuperbill);
  const openPayerSelection = useBillingStore((s) => s.openPayerSelection);
  const changeBilledPayer = useBillingStore((s) => s.changeBilledPayer);
  const calculateMdm = useBillingStore((s) => s.calculateMdm);
  const removeLineItem = useBillingStore((s) => s.removeLineItem);
  const reset = useBillingStore((s) => s.reset);

  const loadStatus = slice?.loadStatus ?? "idle";
  const superbill = slice?.superbill ?? null;
  const mdm = slice?.mdm ?? null;
  const warnings = slice?.warnings ?? [];
  const error = slice?.error ?? null;
  const isSaving = slice?.isSaving ?? false;

  // Track whether we already triggered payer selection to avoid double-fire
  const openedPayerRef = useRef(false);

  // PDF download state
  const [pdfLoading, setPdfLoading] = useState(false);

  // Change Payer: insurance plans for dropdown
  const [insurancePlans, setInsurancePlans] = useState<PatientInsurance[]>([]);
  const [payerDropdownValue, setPayerDropdownValue] = useState<string>("");

  // On mount: reset any stale state then load
  useEffect(() => {
    reset(encounterId);
    loadSuperbill(encounterId);
    openedPayerRef.current = false;
  }, [encounterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // After load: if no superbill exists, open payer selection (intercepts auto-create)
  useEffect(() => {
    if (loadStatus === "loaded" && !superbill && !openedPayerRef.current) {
      openedPayerRef.current = true;
      openPayerSelection(encounterId);
    }
  }, [loadStatus, superbill, encounterId, openPayerSelection]);

  // Fetch MDM calculation
  useEffect(() => {
    if (loadStatus === "loaded") {
      calculateMdm(encounterId);
    }
  }, [loadStatus, encounterId, calculateMdm]);

  // Sync payer dropdown value when superbill loads
  useEffect(() => {
    if (superbill) {
      if (superbill.isSelfPay) {
        setPayerDropdownValue("__self_pay__");
      } else if (superbill.billedPayerId) {
        setPayerDropdownValue(superbill.billedPayerId);
      } else {
        setPayerDropdownValue("__none__");
      }
    }
  }, [superbill]);

  // Fetch patient insurance plans for Change Payer dropdown
  useEffect(() => {
    if (!superbill || !patientId) return;
    fetch(`/api/patients/${patientId}/insurance`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: PatientInsurance[]) => {
        setInsurancePlans(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setInsurancePlans([]);
      });
  }, [superbill?.id, patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadPdf = async () => {
    if (!superbill?.encounterId) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`);
      if (!res.ok) {
        console.error("PDF download failed");
        return;
      }
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
      setPdfLoading(false);
    }
  };

  const handlePayerChange = async (value: string) => {
    if (!superbill) return;
    setPayerDropdownValue(value);
    const isSelfPay = value === "__self_pay__";
    const newPayerId = isSelfPay || value === "__none__" ? null : value;
    await changeBilledPayer(superbill.id, encounterId, newPayerId, isSelfPay);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loadStatus === "loading" || (loadStatus === "loaded" && !superbill && !error)) {
    return (
      <>
        <PayerSelectionModal patientId={patientId} />
        <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
          <div className="animate-spin mr-3 h-5 w-5 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          Preparing superbill...
        </div>
      </>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (loadStatus === "error" || error) {
    return (
      <div className="rounded-lg border border-[var(--state-critical)]/30 bg-[var(--state-critical)]/10 px-4 py-3 text-sm text-[var(--state-critical)]">
        {error ?? "Failed to load superbill"}
      </div>
    );
  }

  if (!superbill) return <PayerSelectionModal patientId={patientId} />;

  const lineItems = superbill.lineItems ?? [];
  const existingCodes = lineItems.map((li) => li.cptCode);
  const mdmColor = mdm?.mdmLevel ? MDM_COLORS[mdm.mdmLevel] : undefined;

  // Build payer name for the current selection
  const currentPayerName = superbill.isSelfPay
    ? "Self-Pay"
    : superbill.billedPayer?.name ?? (superbill.billedPayerId ? "Insurance" : "None");

  return (
    <>
      {/* PayerSelectionModal rendered inside SuperbillEditor for correct portal placement */}
      <PayerSelectionModal patientId={patientId} />

      <div className="space-y-4">
        {/* ── Change Payer section (only when superbill exists) ────────────── */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-glass)] px-4 py-3">
          <label
            htmlFor="billed-payer-select"
            className="text-sm font-medium whitespace-nowrap"
            style={{ color: "var(--text-secondary)" }}
          >
            Billed Payer:
          </label>
          <select
            id="billed-payer-select"
            value={payerDropdownValue}
            onChange={(e) => handlePayerChange(e.target.value)}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--glass-border)",
              color: "var(--text-primary)",
            }}
          >
            {payerDropdownValue === "__none__" && (
              <option value="__none__">— Not Set —</option>
            )}
            {insurancePlans.map((plan) => {
              const priority =
                plan.priority.charAt(0).toUpperCase() + plan.priority.slice(1);
              const planType =
                plan.plan_type.charAt(0).toUpperCase() + plan.plan_type.slice(1);
              const payerName = plan.payer?.name ?? "Unknown";
              return (
                <option key={plan.id} value={plan.payer_id}>
                  {priority} {planType}: {payerName}
                </option>
              );
            })}
            <option value="__self_pay__">Self-Pay</option>
          </select>
          <span
            className="text-xs whitespace-nowrap"
            style={{ color: "var(--text-muted)" }}
          >
            Current: {currentPayerName}
          </span>
        </div>

        {/* ── MDM Glass Card ──────────────────────────────────────────────── */}
        {mdm && (
          <div
            className="rounded-xl border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4
              backdrop-blur-md"
          >
            <div className="flex items-center gap-3 mb-2">
              <Zap size={18} style={{ color: mdmColor }} />
              <h3 className="text-subhead text-[var(--text-primary)] font-semibold">
                MDM Analysis
              </h3>
              <Badge
                className="ml-auto"
                style={{
                  borderColor: `${mdmColor}40`,
                  backgroundColor: `${mdmColor}18`,
                  color: mdmColor,
                }}
              >
                {mdm.mdmLevel}
              </Badge>
            </div>

            <div className="flex items-center gap-4 mb-2">
              <span className="text-caption text-[var(--text-muted)]">
                Suggested E&M:
              </span>
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: mdmColor }}
              >
                {mdm.suggestedEmCode}
              </span>
            </div>

            {mdm.reasoning && (
              <p className="text-caption text-[var(--text-secondary)] leading-relaxed">
                {mdm.reasoning}
              </p>
            )}
          </div>
        )}

        {/* ── Warnings ────────────────────────────────────────────────────── */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div
                key={`${w.cptCode}-${i}`}
                className="rounded-lg border border-[var(--state-caution)]/30
                  bg-[var(--state-caution)]/10 px-3 py-2 text-sm text-[var(--state-caution)]"
              >
                <span className="font-mono font-semibold">{w.cptCode}</span>{" "}
                &mdash; {w.warning}
              </div>
            ))}
          </div>
        )}

        {/* ── Line Item Table ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--glass-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-glass)] text-left text-caption text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">CPT</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium text-right">Fee</th>
                <th className="px-4 py-2 font-medium">Modifiers</th>
                <th className="px-4 py-2 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-[var(--text-muted)]"
                  >
                    No line items yet. Add a CPT code below.
                  </td>
                </tr>
              )}
              {lineItems.map((li, idx) => {
                // Determine fee source styling
                const isManual =
                  li.feeSource === "manual" || li.isFeeOverridden;
                const isBaseRate =
                  li.feeSource === "base_rate" && !li.isFeeOverridden;
                const feeClassName = isManual
                  ? "text-purple-400"
                  : isBaseRate
                    ? "text-yellow-400"
                    : "text-[var(--text-primary)]";
                const feeTooltip = isManual
                  ? "Manually set — won't change on payer switch"
                  : isBaseRate
                    ? "Using base catalog rate — edit to lock"
                    : undefined;

                return (
                  <tr
                    key={li.id}
                    className={
                      idx % 2 === 0
                        ? "bg-[var(--bg-surface)]"
                        : "bg-[var(--bg-elevated)]"
                    }
                  >
                    <td className="px-4 py-2 font-mono text-[var(--accent)]">
                      {li.cptCode}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {li.description}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span
                        className={`inline-flex items-center gap-0.5 ${feeClassName}`}
                        title={feeTooltip}
                      >
                        {isManual && (
                          <Lock
                            size={12}
                            className="flex-shrink-0"
                            aria-hidden
                          />
                        )}
                        ${li.fee.toFixed(2)}
                        {isBaseRate && (
                          <span aria-hidden className="text-yellow-400">
                            *
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {li.modifiers.length > 0 ? (
                        <div className="flex gap-1">
                          {li.modifiers.map((m) => (
                            <Badge key={m} variant="secondary" className="text-xs">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)]">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(encounterId, li.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--state-critical)] transition-colors"
                        aria-label={`Remove ${li.cptCode}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer: Add CPT + PDF Download + Total ──────────────────────── */}
        <div className="flex items-center justify-between">
          <CptAddDropdown
            encounterId={encounterId}
            existingCodes={existingCodes}
          />

          <div className="flex items-center gap-3">
            {/* PDF Download button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm glass-card hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : superbill.claimStatus === "draft" ? (
                <Eye className="w-4 h-4" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span>
                {superbill.claimStatus === "draft" ? "Preview PDF (Draft)" : "Download PDF"}
              </span>
            </button>

            <div className="flex items-center gap-2">
              {isSaving && (
                <div className="animate-spin h-4 w-4 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              )}
              <span className="text-caption text-[var(--text-muted)]">Total:</span>
              <span className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
                ${superbill.totalFee.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
