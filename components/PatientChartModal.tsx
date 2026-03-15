"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// PatientChartModal
//
// Phase 5 will wire real patient data from the API.
// For now, the modal shows a placeholder when opened.
// The dashboard "Next Patient" stat card still opens this modal —
// in Phase 5 it will receive a real patientId and display demographics.
// ---------------------------------------------------------------------------

interface PatientChartModalProps {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientChartModal({
  patientId,
  open,
  onOpenChange,
}: PatientChartModalProps) {
  const { tenant } = useParams<{ tenant: string }>();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Patient Chart</DialogTitle>
          <DialogDescription>
            {patientId ? `Patient ID: ${patientId}` : "No patient selected"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-10 gap-4 px-7 pb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">Patient details coming in Phase 5</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              Real patient demographics will be loaded from the API.
            </p>
          </div>
          {patientId && tenant && (
            <Link
              href={`/${tenant}/patients/${patientId}`}
              onClick={() => onOpenChange(false)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Open patient record &rarr;
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
