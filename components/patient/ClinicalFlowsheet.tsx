"use client";

import { useEffect } from "react";
import { usePatientStore } from "@/store/patientStore";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDecimal(val: number | null | undefined): string {
  if (val == null) return "--";
  return Number(val).toFixed(2);
}

function formatIop(val: number | null | undefined): string {
  if (val == null) return "--";
  return String(Number(val));
}

function iopCellClass(val: number | null | undefined): string {
  if (val == null) return "";
  const n = Number(val);
  if (n > 21) return "text-red-500 font-semibold";
  if (n > 18) return "text-amber-500";
  return "";
}

// ---------------------------------------------------------------------------
// ClinicalFlowsheet
// ---------------------------------------------------------------------------

interface ClinicalFlowsheetProps {
  patientId: string;
}

export function ClinicalFlowsheet({ patientId }: ClinicalFlowsheetProps) {
  const flowsheet = usePatientStore((s) => s.flowsheet);
  const loading = usePatientStore((s) => s.flowsheetLoading);
  const fetchFlowsheet = usePatientStore((s) => s.fetchFlowsheet);

  useEffect(() => {
    fetchFlowsheet(patientId);
  }, [patientId, fetchFlowsheet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (flowsheet.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 3v14h14" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M6 14l3-4 3 2 4-6" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-body text-[var(--text-muted)]">No clinical data to display</p>
      </div>
    );
  }

  const columns = [
    { key: "date", label: "Date", width: "w-28" },
    { key: "iopOd", label: "IOP OD", width: "w-20" },
    { key: "iopOs", label: "IOP OS", width: "w-20" },
    { key: "sphereOd", label: "Sph OD", width: "w-20" },
    { key: "sphereOs", label: "Sph OS", width: "w-20" },
    { key: "cylinderOd", label: "Cyl OD", width: "w-20" },
    { key: "cylinderOs", label: "Cyl OS", width: "w-20" },
    { key: "addOd", label: "Add OD", width: "w-20" },
    { key: "addOs", label: "Add OS", width: "w-20" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.width} px-3 py-2.5 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flowsheet.map((row, idx) => {
            const dateStr = formatClinicDate(row.encounterDate);
            return (
              <tr
                key={row.encounterId}
                className={`border-b border-[var(--border-subtle)] last:border-b-0 ${
                  idx % 2 === 0 ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-elevated)]"
                } hover:bg-[var(--accent-dim)] transition-colors`}
              >
                <td className="px-3 py-2 text-[var(--text-primary)] font-medium">
                  {dateStr}
                </td>
                <td className={`px-3 py-2 text-center ${iopCellClass(row.iopOd)}`}>
                  {formatIop(row.iopOd)}
                </td>
                <td className={`px-3 py-2 text-center ${iopCellClass(row.iopOs)}`}>
                  {formatIop(row.iopOs)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.sphereOd)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.sphereOs)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.cylinderOd)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.cylinderOs)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.addOd)}
                </td>
                <td className="px-3 py-2 text-center text-[var(--text-secondary)]">
                  {formatDecimal(row.addOs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
