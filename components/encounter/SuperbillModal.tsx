"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DollarSign,
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
  Download,
  Brain,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useBillingStore, useSuperbill, useBillingWarnings, useMdmResult } from "@/store/billingStore";
import { useDiagnoses } from "@/store/diagnosisStore";
import { CPT_CATALOG } from "@/types/billing";
import type { ClaimStatus, CptEntry, LineItemCreateRequest, Superbill } from "@/types/billing";
import { buildCms1500Claim, downloadCms1500Json, validateCms1500Claim } from "@/lib/utils/cms1500";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SuperbillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  patientName: string;
  providerName: string;
  encounterDate: string;
}

// ---------------------------------------------------------------------------
// MDM Level Badge
// ---------------------------------------------------------------------------

function MdmBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    straightforward: "var(--state-normal)",
    low: "var(--state-info)",
    moderate: "var(--state-caution)",
    high: "var(--state-critical)",
  };
  const color = colorMap[level] ?? "var(--text-muted)";
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold uppercase"
      style={{ color, borderColor: color }}
    >
      {level} MDM
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Add CPT Code Dropdown
// ---------------------------------------------------------------------------

function AddCptDropdown({
  existingCodes,
  onAdd,
}: {
  existingCodes: Set<string>;
  onAdd: (entry: CptEntry) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const available = CPT_CATALOG.filter((c) => !existingCodes.has(c.code));

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
        style={{
          color: "var(--accent)",
          border: "1px dashed var(--accent)",
          background: "transparent",
        }}
      >
        <Plus size={12} />
        Add CPT Code
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className="absolute top-full left-0 mt-1 z-50 w-80 max-h-60 overflow-y-auto rounded-xl shadow-lg"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--glass-border)",
            }}
          >
            {available.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => {
                  onAdd(entry);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-glass)] transition-colors flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {entry.code}
                  </span>
                  <span className="ml-2" style={{ color: "var(--text-secondary)" }}>
                    {entry.description}
                  </span>
                </div>
                <span className="font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  ${entry.defaultFee.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuperbillModal({
  open,
  onOpenChange,
  encounterId,
  patientName,
  providerName,
  encounterDate,
}: SuperbillModalProps) {
  const superbill = useSuperbill(encounterId);
  const warnings = useBillingWarnings(encounterId);
  const mdm = useMdmResult(encounterId);
  const loadSuperbill = useBillingStore((s) => s.loadSuperbill);
  const createSuperbill = useBillingStore((s) => s.createSuperbill);
  const updateStatus = useBillingStore((s) => s.updateStatus);
  const addLineItem = useBillingStore((s) => s.addLineItem);
  const removeLineItem = useBillingStore((s) => s.removeLineItem);
  const isSaving = useBillingStore(
    (s) => s.encounters[encounterId]?.isSaving ?? false,
  );
  const loadStatus = useBillingStore(
    (s) => s.encounters[encounterId]?.loadStatus ?? "idle",
  );
  const storeError = useBillingStore(
    (s) => s.encounters[encounterId]?.error ?? null,
  );

  const allDiagnoses = useDiagnoses(encounterId);
  const activeDiagnoses = allDiagnoses.filter((dx) => dx.status === "Active");
  const icdCodes = activeDiagnoses.map((dx) => dx.icd10Code);

  // Load or create superbill on open
  useEffect(() => {
    if (!open) return;
    if (loadStatus === "idle") {
      loadSuperbill(encounterId);
    }
  }, [open, encounterId, loadStatus, loadSuperbill]);

  // Auto-create superbill if none exists after load
  useEffect(() => {
    if (!open) return;
    if (loadStatus === "loaded" && !superbill && !isSaving && !storeError) {
      createSuperbill(encounterId);
    }
  }, [open, loadStatus, superbill, isSaving, storeError, encounterId, createSuperbill]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleAddCpt = useCallback(
    (entry: CptEntry) => {
      const item: LineItemCreateRequest = {
        cptCode: entry.code,
        description: entry.description,
        fee: entry.defaultFee,
        units: 1,
        diagnosisPointers: icdCodes.slice(0, 4),
        modifiers: [],
      };
      addLineItem(encounterId, item);
    },
    [encounterId, addLineItem, icdCodes],
  );

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      removeLineItem(encounterId, itemId);
    },
    [encounterId, removeLineItem],
  );

  const handleMarkReady = useCallback(() => {
    updateStatus(encounterId, "ready_to_bill");
  }, [encounterId, updateStatus]);

  const handleExportCms1500 = useCallback(() => {
    if (!superbill) return;

    // Build patient info from what we have
    const nameParts = patientName.split(" ");
    const claim = buildCms1500Claim(
      superbill,
      {
        firstName: nameParts[0] ?? "",
        lastName: (nameParts.slice(1).join(" ") || nameParts[0]) ?? "",
        dob: "1970-01-01", // Would come from patient record
        sex: "unknown",
      },
      {
        providerName,
        providerNpi: "",
        providerTaxId: "",
        facilityName: "ClarityOS Demo Clinic",
        facilityAddress: "123 Vision Way",
        facilityCity: "Anytown",
        facilityState: "CA",
        facilityZip: "90210",
        facilityNpi: "",
        billingPhone: "(555) 000-0000",
      },
      encounterDate,
    );

    const validation = validateCms1500Claim(claim);
    if (!validation.valid) {
      // Still download but warn
      console.warn("CMS-1500 validation warnings:", validation.errors);
    }

    downloadCms1500Json(claim);
  }, [superbill, patientName, providerName, encounterDate]);

  // ── Derived state ─────────────────────────────────────────────────────

  const existingCptCodes = new Set(
    superbill?.lineItems?.map((li) => li.cptCode) ?? [],
  );
  const isReadyToBill = superbill?.claimStatus === "ready_to_bill";
  const isLoading = (loadStatus === "loading" || (loadStatus === "loaded" && !superbill && isSaving)) && !storeError;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
      >
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign size={20} style={{ color: "var(--accent)" }} />
            <DialogTitle
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Superbill
            </DialogTitle>
            {superbill && (
              <Badge
                variant={isReadyToBill ? "default" : "secondary"}
                className="text-[10px] ml-2"
              >
                {superbill.claimStatus.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <DialogDescription
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Review CPT codes, diagnosis pointers, and billing totals for this encounter.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
                <div className="w-4 h-4 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
                Generating superbill...
              </div>
            </div>
          )}

          {/* Error state */}
          {storeError && (
            <div
              className="text-xs px-4 py-3 rounded-xl"
              style={{
                color: "var(--state-critical)",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              {storeError}
            </div>
          )}

          {/* MDM Section */}
          {mdm && !isLoading && (
            <div
              className="rounded-xl p-4"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Brain size={13} />
                  Medical Decision Making
                </div>
                <div className="flex items-center gap-2">
                  <MdmBadge level={mdm.mdmLevel} />
                  {mdm.suggestedEmCode && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {mdm.suggestedEmCode}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {mdm.reasoning}
              </p>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && !isLoading && (
            <div
              className="rounded-xl p-4 space-y-2"
              style={{
                background: "rgba(234,179,8,0.06)",
                border: "1px solid rgba(234,179,8,0.2)",
              }}
            >
              <div
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--state-caution)" }}
              >
                <AlertTriangle size={13} />
                Validation Warnings
              </div>
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--state-caution)" }}>
                  <XCircle size={12} className="flex-shrink-0 mt-0.5" />
                  <span>{w.warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Line Items Table */}
          {superbill && !isLoading && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{
                  background: "var(--bg-glass)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <FileText size={13} />
                  CPT Codes
                </div>
                <AddCptDropdown existingCodes={existingCptCodes} onAdd={handleAddCpt} />
              </div>

              {superbill.lineItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  No CPT codes added yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <th className="text-left text-[10px] font-medium px-4 py-2" style={{ color: "var(--text-muted)" }}>
                        CPT
                      </th>
                      <th className="text-left text-[10px] font-medium px-2 py-2" style={{ color: "var(--text-muted)" }}>
                        Description
                      </th>
                      <th className="text-center text-[10px] font-medium px-2 py-2" style={{ color: "var(--text-muted)" }}>
                        Dx Pointers
                      </th>
                      <th className="text-right text-[10px] font-medium px-2 py-2" style={{ color: "var(--text-muted)" }}>
                        Units
                      </th>
                      <th className="text-right text-[10px] font-medium px-4 py-2" style={{ color: "var(--text-muted)" }}>
                        Fee
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {superbill.lineItems.map((li) => {
                      const hasPointerWarning = !li.diagnosisPointers || li.diagnosisPointers.length === 0;
                      return (
                        <tr
                          key={li.id}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-mono font-semibold text-xs" style={{ color: "var(--text-primary)" }}>
                              {li.cptCode}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                            {li.description}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {hasPointerWarning ? (
                              <Badge variant="outline" className="text-[9px]" style={{ color: "var(--state-caution)", borderColor: "var(--state-caution)" }}>
                                None
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-1 justify-center flex-wrap">
                                {li.diagnosisPointers.map((code) => (
                                  <Badge key={code} variant="secondary" className="text-[9px] font-mono">
                                    {code}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                            {li.units}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                            ${(li.fee * li.units).toFixed(2)}
                          </td>
                          <td className="pr-3">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(li.id)}
                              className="p-1 rounded-md transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                              style={{ color: "var(--text-muted)" }}
                              title="Remove line item"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold" style={{ color: "var(--accent)" }}>
                        ${superbill.totalFee.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* Diagnoses Reference */}
          {activeDiagnoses.length > 0 && !isLoading && (
            <div
              className="rounded-xl p-4"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              <div
                className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Encounter Diagnoses (ICD-10)
              </div>
              <div className="space-y-1">
                {activeDiagnoses.map((dx) => (
                  <div key={dx.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="text-[9px] font-mono flex-shrink-0">
                      {dx.icd10Code}
                    </Badge>
                    <span style={{ color: "var(--text-primary)" }}>{dx.description}</span>
                    {dx.eyeAffected && (
                      <Badge variant="outline" className="text-[9px]">{dx.eyeAffected}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div
          className="flex-shrink-0 px-6 pb-6 pt-4 space-y-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            {/* Mark Ready to Bill */}
            {superbill && superbill.claimStatus === "draft" && (
              <button
                type="button"
                onClick={handleMarkReady}
                disabled={isSaving || warnings.length > 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: "var(--accent)",
                  color: "var(--text-inverse)",
                }}
              >
                {isSaving ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    Mark Ready to Bill
                  </>
                )}
              </button>
            )}

            {/* Already ready badge */}
            {superbill && superbill.claimStatus !== "draft" && (
              <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium" style={{ color: "var(--state-normal)", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <CheckCircle size={14} />
                {superbill.claimStatus.replace(/_/g, " ")}
              </div>
            )}

            {/* Export CMS-1500 */}
            {superbill && (
              <button
                type="button"
                onClick={handleExportCms1500}
                className="px-4 py-2.5 rounded-xl text-sm font-medium hover-btn flex items-center gap-2"
                style={{
                  background: "var(--bg-glass)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <Download size={14} />
                Export CMS-1500
              </button>
            )}

            {/* Close */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium hover-btn"
              style={{
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
                border: "1px solid var(--glass-border)",
              }}
            >
              Close
            </button>
          </div>

          {warnings.length > 0 && superbill?.claimStatus === "draft" && (
            <p className="text-[10px] text-center" style={{ color: "var(--state-caution)" }}>
              Resolve validation warnings before marking as ready to bill.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
