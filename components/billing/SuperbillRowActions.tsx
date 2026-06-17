"use client";

import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";

import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import type { ClaimStatus } from "@/types/billing";

/**
 * "Take payment" entry point for a superbill row (/billing).
 *
 * Routes into the POS surface pre-filled with the patient-owed amount for this
 * superbill (POS-08). Gated on the RETAIL_POS entitlement + front-desk roles,
 * and only shown for superbills that are billable (ready_to_bill / submitted).
 */

const TAKE_PAYMENT_ROLES: Array<
  "owner" | "admin" | "technician" | "receptionist"
> = ["owner", "admin", "technician", "receptionist"];

const PAYABLE_STATUSES = new Set<ClaimStatus>(["ready_to_bill", "submitted"]);

export function SuperbillRowActions({
  superbillId,
  patientId,
  status,
  tenant,
}: {
  superbillId: string;
  patientId: string;
  status: ClaimStatus;
  tenant: string;
}) {
  const router = useRouter();
  const { has, requireRole } = useEntitlements();

  if (!has(Entitlement.RETAIL_POS)) return null;
  if (!requireRole(...TAKE_PAYMENT_ROLES)) return null;
  if (!PAYABLE_STATUSES.has(status)) return null;

  return (
    <button
      type="button"
      onClick={() =>
        router.push(
          `/${tenant}/pos?patient=${patientId}&prefill=superbill:${superbillId}`,
        )
      }
      className="p-1.5 rounded-lg hover:bg-[var(--bg-glass)] transition-colors text-[var(--text-muted)] hover:text-[var(--accent)]"
      title="Take payment"
      aria-label="Take payment"
    >
      <CreditCard size={14} />
    </button>
  );
}
