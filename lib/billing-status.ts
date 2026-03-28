/**
 * lib/billing-status.ts
 *
 * Shared billing claim status styles used across the billing dashboard
 * and patient billing tab.
 */

export const BILLING_STATUS_STYLES: Record<
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
