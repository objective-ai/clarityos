"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  CreditCard,
  User,
  FileDown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useBillingStore,
  useSuperbill,
  useBillingWarnings,
  useMdmResult,
} from "@/store/billingStore";
import { useDiagnoses } from "@/store/diagnosisStore";
import { CPT_CATALOG } from "@/types/billing";
import type {
  CptEntry,
  LineItemCreateRequest,
  MdmLevel,
  PatientInsurance,
} from "@/types/billing";
import {
  buildCms1500Claim,
  downloadCms1500Json,
  validateCms1500Claim,
} from "@/lib/utils/cms1500";
import { fetchPatientInsurance, fetchPayerFeeSchedule, fetchSuperbillPdfBlob } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// MDM colour map
// ---------------------------------------------------------------------------

const MDM_COLORS: Record<MdmLevel, string> = {
  straightforward: "#2DD4BF",
  low: "#60A5FA",
  moderate: "#FBBF24",
  high: "#FB7185",
};

// ---------------------------------------------------------------------------
// CptAddDropdown — searchable inline add
// ---------------------------------------------------------------------------

function CptAddDropdown({
  encounterId,
  existingCodes,
  onAdd,
  payerFeeMap,
}: {
  encounterId: string;
  existingCodes: string[];
  onAdd?: (entry: CptEntry) => void;
  payerFeeMap?: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addLineItem = useBillingStore((s) => s.addLineItem);

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
    if (onAdd) {
      onAdd(entry);
    } else {
      const payerFee = payerFeeMap?.get(entry.code);
      await addLineItem(encounterId, {
        cptCode: entry.code,
        description: entry.description,
        fee: payerFee ?? entry.defaultFee,
        units: 1,
      });
    }
    setOpen(false);
    setSearch("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          color: "var(--accent)",
          border: "1px dashed var(--accent)",
          background: "transparent",
        }}
      >
        <Plus size={12} />
        Add CPT Code
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
        className="glass-input w-96 text-sm"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-[560px] max-h-56 overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-[var(--bg-elevated)] shadow-xl">
          {filtered.map((entry) => (
            <li key={entry.code}>
              <button
                type="button"
                onClick={() => handleSelect(entry)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="font-mono text-[var(--accent)]">{entry.code}</span>
                <span className="flex-1 truncate text-[var(--text-secondary)]">
                  {entry.description}
                </span>
                <span className="shrink-0 text-[var(--text-muted)]">
                  {payerFeeMap?.has(entry.code) ? (
                    <span title="Payer rate">
                      ${payerFeeMap.get(entry.code)!.toFixed(2)}
                    </span>
                  ) : (
                    <span title="Base rate">
                      ${entry.defaultFee.toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {filtered.length === 0 && search && (
        <div className="absolute z-50 mt-1 w-[560px] rounded-lg border border-[var(--glass-border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]">
          No matching CPT codes
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step header
// ---------------------------------------------------------------------------

function StepHeader({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
      >
        {step}
      </div>
      <span
        className="text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </span>
      <span
        className="text-[11px] ml-auto tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        {step} of {total}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BillingWorkflow props
// ---------------------------------------------------------------------------

export interface BillingWorkflowProps {
  encounterId: string;
  patientId: string;
  patientName?: string;
  providerName?: string;
  encounterDate?: string;
  onDone?: () => void;
}

// ---------------------------------------------------------------------------
// BillingWorkflow — unified inline 3-step component
// ---------------------------------------------------------------------------

export function BillingWorkflow({
  encounterId,
  patientId,
  patientName = "Patient",
  providerName = "",
  encounterDate = "",
  onDone,
}: BillingWorkflowProps) {
  // ── Store ──────────────────────────────────────────────────────────────
  const slice = useBillingStore((s) => s.encounters[encounterId] ?? null);
  const superbill = useSuperbill(encounterId);
  const warnings = useBillingWarnings(encounterId);
  const mdm = useMdmResult(encounterId);

  const loadSuperbill = useBillingStore((s) => s.loadSuperbill);
  const createSuperbillWithPayer = useBillingStore(
    (s) => s.createSuperbillWithPayer,
  );
  const changeBilledPayer = useBillingStore((s) => s.changeBilledPayer);
  const addLineItem = useBillingStore((s) => s.addLineItem);
  const removeLineItem = useBillingStore((s) => s.removeLineItem);
  const updateStatus = useBillingStore((s) => s.updateStatus);
  const calculateMdm = useBillingStore((s) => s.calculateMdm);
  const reset = useBillingStore((s) => s.reset);

  const loadStatus = slice?.loadStatus ?? "idle";
  const error = slice?.error ?? null;
  const isSaving = slice?.isSaving ?? false;

  // ── Diagnoses for dx pointers ──────────────────────────────────────────
  const allDiagnoses = useDiagnoses(encounterId);
  const activeDiagnoses = allDiagnoses.filter(
    (dx) => dx.status.toLowerCase() === "active",
  );
  const icdCodes = activeDiagnoses.map((dx) => dx.icd10Code);

  // ── Local state ────────────────────────────────────────────────────────
  const [step, setStep] = useState<"payer" | "review">("payer");
  const [cameFromPayerStep, setCameFromPayerStep] = useState(false);

  // Step 1 — payer selection
  const [insurancePlans, setInsurancePlans] = useState<PatientInsurance[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(null);
  const [isSelfPayStep1, setIsSelfPayStep1] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Step 2 — payer change dropdown
  const [payerDropdownValue, setPayerDropdownValue] = useState<string>("");

  // PDF download
  const [pdfLoading, setPdfLoading] = useState(false);

  // Payer fee schedule (CPT code -> payer-specific fee)
  const [payerFeeMap, setPayerFeeMap] = useState<Map<string, number>>(new Map());

  // ── On mount: reset + load + fetch insurance ───────────────────────────
  useEffect(() => {
    reset(encounterId);
    loadSuperbill(encounterId);

    setIsLoadingPlans(true);
    fetchPatientInsurance(patientId)
      .then((data) => setInsurancePlans(data as PatientInsurance[]))
      .catch(() => setInsurancePlans([]))
      .finally(() => setIsLoadingPlans(false));
  }, [encounterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── After load: determine starting step ───────────────────────────────
  useEffect(() => {
    if (loadStatus !== "loaded") return;
    if (superbill?.billedPayerId || superbill?.isSelfPay) {
      setStep("review");
      // Load fee schedule for existing payer
      if (superbill.billedPayerId) {
        fetchPayerFeeSchedule(superbill.billedPayerId).then(setPayerFeeMap);
      }
    } else {
      setStep("payer");
      setCameFromPayerStep(true);
    }
  }, [loadStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync payer dropdown when superbill loads ───────────────────────────
  useEffect(() => {
    if (!superbill) return;
    if (superbill.isSelfPay) setPayerDropdownValue("__self_pay__");
    else if (superbill.billedPayerId) setPayerDropdownValue(superbill.billedPayerId);
    else setPayerDropdownValue("__none__");
  }, [superbill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calculate MDM when entering review step ────────────────────────────
  useEffect(() => {
    if (step === "review" && loadStatus === "loaded") {
      calculateMdm(encounterId);
    }
  }, [step, loadStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleConfirmPayer = async () => {
    if (!selectedPayerId && !isSelfPayStep1) return;
    setIsConfirming(true);
    try {
      if (superbill) {
        // Superbill already exists — update its payer instead of creating a new one
        await changeBilledPayer(superbill.id, encounterId, selectedPayerId, isSelfPayStep1);
      } else {
        await createSuperbillWithPayer(encounterId, selectedPayerId, isSelfPayStep1);
      }
      // Fetch payer fee schedule for fee overlay
      const feeMap = await fetchPayerFeeSchedule(isSelfPayStep1 ? null : selectedPayerId);
      setPayerFeeMap(feeMap);
      setStep("review");
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePayerChange = async (value: string) => {
    if (!superbill) return;
    setPayerDropdownValue(value);
    const selfPay = value === "__self_pay__";
    const newPayerId = selfPay || value === "__none__" ? null : value;
    await changeBilledPayer(superbill.id, encounterId, newPayerId, selfPay);
    // Refresh fee schedule for new payer
    const feeMap = await fetchPayerFeeSchedule(newPayerId);
    setPayerFeeMap(feeMap);
  };

  const handleAddCpt = useCallback(
    (entry: CptEntry) => {
      const payerFee = payerFeeMap.get(entry.code);
      const item: LineItemCreateRequest = {
        cptCode: entry.code,
        description: entry.description,
        fee: payerFee ?? entry.defaultFee,
        units: 1,
        diagnosisPointers: icdCodes.slice(0, 4),
        modifiers: [],
      };
      addLineItem(encounterId, item);
    },
    [encounterId, addLineItem, icdCodes, payerFeeMap],
  );

  const handleMarkReady = async () => {
    await updateStatus(encounterId, "ready_to_bill");
    onDone?.();
  };

  const handleExportCms1500 = useCallback(() => {
    if (!superbill) return;
    const nameParts = patientName.split(" ");
    const claim = buildCms1500Claim(
      superbill,
      {
        firstName: nameParts[0] ?? "",
        lastName: (nameParts.slice(1).join(" ") || nameParts[0]) ?? "",
        dob: "1970-01-01",
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
    if (!validation.valid)
      console.warn("CMS-1500 validation warnings:", validation.errors);
    downloadCms1500Json(claim);
  }, [superbill, patientName, providerName, encounterDate]);

  const handleDownloadPdf = async () => {
    if (!superbill) return;
    setPdfLoading(true);
    try {
      const blob = await fetchSuperbillPdfBlob(encounterId);
      if (!blob) return;
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

  // ── Loading ────────────────────────────────────────────────────────────
  if (loadStatus === "loading" || loadStatus === "idle") {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
        <div className="animate-spin mr-3 h-5 w-5 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        Loading billing...
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (loadStatus === "error" || error) {
    return (
      <div
        className="rounded-lg px-4 py-3 text-sm"
        style={{
          color: "var(--state-critical)",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        {error ?? "Failed to load superbill"}
      </div>
    );
  }

  const lineItems = superbill?.lineItems ?? [];
  const existingCodes = lineItems.map((li) => li.cptCode);
  const mdmColor = mdm?.mdmLevel ? MDM_COLORS[mdm.mdmLevel] : undefined;
  const isReadyToBill = superbill?.claimStatus === "ready_to_bill";
  const hasPayerSelection = selectedPayerId !== null || isSelfPayStep1;

  // Derive copay from the currently billed payer's insurance record
  const billedPlan = superbill?.isSelfPay
    ? null
    : insurancePlans.find(
        (p) => p.payer_id === superbill?.billedPayerId && p.is_active,
      );
  const primaryCopay = billedPlan?.copay_amount ?? null;

  // ── Step 1: Choose Payer ───────────────────────────────────────────────
  if (step === "payer") {
    return (
      <div className="space-y-4">
        <StepHeader step={1} total={2} label="Choose Insurance Plan" />

        <p
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Select which insurance plan to bill for this encounter.
        </p>

        {isLoadingPlans ? (
          <div
            className="flex items-center justify-center py-8 gap-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <div
              className="animate-spin h-4 w-4 rounded-full border-2 border-t-transparent"
              style={{
                borderColor: "var(--accent)",
                borderTopColor: "transparent",
              }}
            />
            Loading insurance plans...
          </div>
        ) : (
          <div className="space-y-2">
            {insurancePlans.map((plan) => {
              const isSelected =
                selectedPayerId === plan.payer_id && !isSelfPayStep1;
              const priority =
                plan.priority.charAt(0).toUpperCase() +
                plan.priority.slice(1);
              const planType =
                plan.plan_type.charAt(0).toUpperCase() +
                plan.plan_type.slice(1);
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => {
                    setSelectedPayerId(plan.payer_id);
                    setIsSelfPayStep1(false);
                  }}
                  className="w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-start gap-3"
                  style={{
                    background: isSelected
                      ? "rgba(45,212,191,0.08)"
                      : "var(--bg-glass)",
                    border: isSelected
                      ? "2px solid var(--accent)"
                      : "1px solid var(--glass-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <CreditCard
                    size={16}
                    className="mt-0.5 flex-shrink-0"
                    style={{
                      color: isSelected
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block">
                      {priority} {planType}: {plan.payer_name}
                    </span>
                    {plan.subscriber_id && (
                      <span
                        className="text-xs mt-0.5 block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Member ID: {plan.subscriber_id}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <CheckCircle
                      size={14}
                      className="ml-auto mt-0.5 flex-shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}

            {/* Self-Pay */}
            <button
              type="button"
              onClick={() => {
                setSelectedPayerId(null);
                setIsSelfPayStep1(true);
              }}
              className="w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-start gap-3"
              style={{
                background: isSelfPayStep1
                  ? "rgba(45,212,191,0.08)"
                  : "var(--bg-glass)",
                border: isSelfPayStep1
                  ? "2px solid var(--accent)"
                  : "1px solid var(--glass-border)",
                color: "var(--text-primary)",
              }}
            >
              <User
                size={16}
                className="mt-0.5 flex-shrink-0"
                style={{
                  color: isSelfPayStep1
                    ? "var(--accent)"
                    : "var(--text-muted)",
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">Self-Pay</span>
                <span
                  className="text-xs mt-0.5 block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Patient pays out of pocket
                </span>
              </div>
              {isSelfPayStep1 && (
                <CheckCircle
                  size={14}
                  className="ml-auto mt-0.5 flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                />
              )}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirmPayer}
          disabled={!hasPayerSelection || isConfirming}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
          }}
        >
          {isConfirming ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Creating superbill...
            </>
          ) : (
            <>
              Continue to Review
              <ChevronRight size={14} />
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Step 2: Review & Code ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row with optional back button */}
      <div className="flex items-center gap-1">
        {cameFromPayerStep && !superbill && (
          <button
            type="button"
            onClick={() => setStep("payer")}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-glass)]"
            style={{ color: "var(--text-muted)" }}
            title="Back to payer selection"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <StepHeader step={2} total={2} label="Review & Code" />
      </div>

      {/* Payer row */}
      {superbill && (
        <div
          className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-glass)] px-4 py-3"
        >
          <label
            htmlFor="bw-payer-select"
            className="text-sm font-medium whitespace-nowrap"
            style={{ color: "var(--text-secondary)" }}
          >
            Billed Payer:
          </label>
          <select
            id="bw-payer-select"
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
                plan.priority.charAt(0).toUpperCase() +
                plan.priority.slice(1);
              const planType =
                plan.plan_type.charAt(0).toUpperCase() +
                plan.plan_type.slice(1);
              return (
                <option key={plan.id} value={plan.payer_id}>
                  {priority} {planType}: {plan.payer_name}
                </option>
              );
            })}
            <option value="__self_pay__">Self-Pay</option>
          </select>
          {primaryCopay != null && (
            <div className="flex items-center gap-1.5 text-[12px] whitespace-nowrap flex-shrink-0">
              <span style={{ color: "var(--text-muted)" }}>Copay:</span>
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                ${Number(primaryCopay).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* MDM */}
      {mdm && (
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
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase"
                style={{ color: mdmColor, borderColor: mdmColor }}
              >
                {mdm.mdmLevel} MDM
              </Badge>
              {mdm.suggestedEmCode && (
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {mdm.suggestedEmCode}
                </Badge>
              )}
            </div>
          </div>
          {mdm.reasoning && (
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {mdm.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
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
            <div
              key={i}
              className="flex items-start gap-2 text-xs"
              style={{ color: "var(--state-caution)" }}
            >
              <XCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{w.warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* CPT table */}
      {superbill && (
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
            <CptAddDropdown
              encounterId={encounterId}
              existingCodes={existingCodes}
              onAdd={handleAddCpt}
              payerFeeMap={payerFeeMap}
            />
          </div>

          {superbill.lineItems.length === 0 ? (
            <div
              className="px-4 py-6 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              No CPT codes added yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th
                    className="text-left text-[10px] font-medium px-4 py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    CPT
                  </th>
                  <th
                    className="text-left text-[10px] font-medium px-2 py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Description
                  </th>
                  <th
                    className="text-center text-[10px] font-medium px-2 py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Dx Pointers
                  </th>
                  <th
                    className="text-right text-[10px] font-medium px-2 py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Units
                  </th>
                  <th
                    className="text-right text-[10px] font-medium px-4 py-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Fee
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {superbill.lineItems.map((li) => {
                  const hasPointerWarning =
                    !li.diagnosisPointers || li.diagnosisPointers.length === 0;
                  return (
                    <tr
                      key={li.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className="font-mono font-semibold text-xs"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {li.cptCode}
                        </span>
                      </td>
                      <td
                        className="px-2 py-2.5 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {li.description}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {hasPointerWarning ? (
                          <Badge
                            variant="outline"
                            className="text-[9px]"
                            style={{
                              color: "var(--state-caution)",
                              borderColor: "var(--state-caution)",
                            }}
                          >
                            None
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1 justify-center flex-wrap">
                            {li.diagnosisPointers.map((code) => (
                              <Badge
                                key={code}
                                variant="secondary"
                                className="text-[9px] font-mono"
                              >
                                {code}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td
                        className="px-2 py-2.5 text-right text-xs font-mono"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {li.units}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right text-xs font-mono"
                        style={{ color: "var(--text-primary)" }}
                      >
                        ${(li.fee * li.units).toFixed(2)}
                      </td>
                      <td className="pr-3">
                        <button
                          type="button"
                          onClick={() => removeLineItem(encounterId, li.id)}
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
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-right text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Total
                  </td>
                  <td
                    className="px-4 py-3 text-right text-sm font-mono font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    ${superbill.totalFee.toFixed(2)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Diagnoses reference */}
      {activeDiagnoses.length > 0 && (
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
                <Badge
                  variant="secondary"
                  className="text-[9px] font-mono flex-shrink-0"
                >
                  {dx.icd10Code}
                </Badge>
                <span style={{ color: "var(--text-primary)" }}>
                  {dx.description}
                </span>
                {dx.eyeAffected && (
                  <Badge variant="outline" className="text-[9px]">
                    {dx.eyeAffected}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-3">
          {/* Mark Ready to Bill */}
          {superbill && !isReadyToBill && (
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

          {/* Already posted */}
          {superbill && isReadyToBill && (
            <div
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
              style={{
                color: "var(--state-normal)",
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              <CheckCircle size={14} />
              {superbill.claimStatus.replace(/_/g, " ")}
            </div>
          )}

          {/* PDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading || !superbill}
            className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40 transition-colors"
            style={{
              background: "var(--bg-glass)",
              color: "var(--text-secondary)",
              border: "1px solid var(--glass-border)",
            }}
          >
            {pdfLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : superbill?.claimStatus === "draft" ? (
              <FileDown className="w-4 h-4" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            {superbill?.claimStatus === "draft" ? "Preview PDF" : "Download PDF"}
          </button>

          {/* CMS-1500 */}
          {superbill && (
            <button
              type="button"
              onClick={handleExportCms1500}
              className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
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
        </div>

        {warnings.length > 0 && superbill && !isReadyToBill && (
          <p
            className="text-[10px] text-center"
            style={{ color: "var(--state-caution)" }}
          >
            Resolve validation warnings before marking as ready to bill.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BillingWorkflowDialog — Dialog wrapper for post-finalization Superbill button
// ---------------------------------------------------------------------------

export function BillingWorkflowDialog({
  open,
  onOpenChange,
  ...props
}: BillingWorkflowProps & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[70vw] flex flex-col"
        style={{ maxHeight: "85vh" }}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
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
          </div>
          <DialogDescription
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Review CPT codes, diagnosis pointers, and billing totals for this
            encounter.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <BillingWorkflow {...props} onDone={() => onOpenChange(false)} />
        </div>

        <div
          className="flex-shrink-0 px-6 pb-5 pt-3 flex justify-end"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--bg-glass)]"
            style={{
              background: "var(--bg-glass)",
              color: "var(--text-secondary)",
              border: "1px solid var(--glass-border)",
            }}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
