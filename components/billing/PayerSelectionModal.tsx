"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useBillingStore } from "@/store/billingStore";
import type { PatientInsurance } from "@/types/billing";

// ---------------------------------------------------------------------------
// PayerSelectionModal
//
// Reads payerSelectionOpen + pendingEncounterId directly from billingStore.
// Fetches patient's insurance plans when the modal opens.
// On confirm: calls createSuperbillWithPayer with the selected payer.
// ---------------------------------------------------------------------------

export function PayerSelectionModal({ patientId }: { patientId: string }) {
  const open = useBillingStore((s) => s.payerSelectionOpen);
  const encounterId = useBillingStore((s) => s.pendingEncounterId);
  const createSuperbillWithPayer = useBillingStore(
    (s) => s.createSuperbillWithPayer,
  );
  const closePayerSelection = useBillingStore((s) => s.closePayerSelection);

  const [insurancePlans, setInsurancePlans] = useState<PatientInsurance[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(null);
  const [isSelfPay, setIsSelfPay] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Fetch patient insurance when modal opens
  useEffect(() => {
    if (!open || !patientId) return;

    // Reset selection on each open
    setSelectedPayerId(null);
    setIsSelfPay(false);

    setIsLoadingPlans(true);
    fetch(`/api/patients/${patientId}/insurance`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: PatientInsurance[]) => {
        setInsurancePlans(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setInsurancePlans([]);
      })
      .finally(() => {
        setIsLoadingPlans(false);
      });
  }, [open, patientId]);

  const handleSelectInsurance = (plan: PatientInsurance) => {
    setSelectedPayerId(plan.payer_id);
    setIsSelfPay(false);
  };

  const handleSelectSelfPay = () => {
    setSelectedPayerId(null);
    setIsSelfPay(true);
  };

  const hasSelection = isSelfPay || selectedPayerId !== null;

  const handleConfirm = async () => {
    if (!hasSelection || !encounterId) return;
    setIsConfirming(true);
    try {
      await createSuperbillWithPayer(encounterId, selectedPayerId, isSelfPay);
    } finally {
      setIsConfirming(false);
    }
  };

  // Format display label for insurance plan
  const formatPlanLabel = (plan: PatientInsurance): string => {
    const priority =
      plan.priority.charAt(0).toUpperCase() + plan.priority.slice(1);
    const planType =
      plan.plan_type.charAt(0).toUpperCase() + plan.plan_type.slice(1);
    const payerName = plan.payer?.name ?? "Unknown Payer";
    return `${priority} ${planType}: ${payerName}`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closePayerSelection()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Choose Insurance Plan
          </DialogTitle>
          <DialogDescription
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Select which insurance plan to bill for this encounter.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-2">
          {isLoadingPlans ? (
            <div
              className="flex items-center justify-center py-8 gap-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              <div
                className="animate-spin h-4 w-4 rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              Loading insurance plans...
            </div>
          ) : (
            <>
              {/* Insurance plan options */}
              {insurancePlans.map((plan) => {
                const isSelected = selectedPayerId === plan.payer_id && !isSelfPay;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => handleSelectInsurance(plan)}
                    className="w-full text-left px-4 py-3 rounded-xl transition-all"
                    style={{
                      background: "var(--bg-glass)",
                      border: isSelected
                        ? "2px solid var(--accent)"
                        : "1px solid var(--glass-border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <span className="text-sm font-medium">
                      {formatPlanLabel(plan)}
                    </span>
                    {plan.subscriber_id && (
                      <span
                        className="block text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Member ID: {plan.subscriber_id}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Self-Pay option — always at bottom */}
              <button
                type="button"
                onClick={handleSelectSelfPay}
                className="w-full text-left px-4 py-3 rounded-xl transition-all"
                style={{
                  background: "var(--bg-glass)",
                  border: isSelfPay
                    ? "2px solid var(--accent)"
                    : "1px solid var(--glass-border)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="text-sm font-medium">Self-Pay</span>
                <span
                  className="block text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Patient pays out of pocket
                </span>
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasSelection || isConfirming}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
            }}
          >
            {isConfirming ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden
                />
                Creating...
              </>
            ) : (
              "Confirm"
            )}
          </button>
          <button
            type="button"
            onClick={closePayerSelection}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: "var(--bg-glass)",
              color: "var(--text-secondary)",
              border: "1px solid var(--glass-border)",
            }}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
