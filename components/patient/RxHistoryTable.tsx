"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { usePatientStore } from "@/store/patientStore";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRx(val: number | null | undefined): string {
  if (val == null) return "--";
  const n = Number(val);
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function formatAxis(val: number | null | undefined): string {
  if (val == null) return "--";
  return `${val}°`;
}

type ModalityFilter = "all" | "glasses" | "contact_lens";

// ---------------------------------------------------------------------------
// RxHistoryTable
// ---------------------------------------------------------------------------

interface RxHistoryTableProps {
  patientId: string;
}

export function RxHistoryTable({ patientId }: RxHistoryTableProps) {
  const rxHistory = usePatientStore((s) => s.rxHistory);
  const loading = usePatientStore((s) => s.rxHistoryLoading);
  const error = usePatientStore((s) => s.rxHistoryError);
  const fetchRxHistory = usePatientStore((s) => s.fetchRxHistory);
  const [filter, setFilter] = useState<ModalityFilter>("all");

  useEffect(() => {
    fetchRxHistory(patientId, filter === "all" ? undefined : filter);
  }, [patientId, filter, fetchRxHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-body text-red-500 mb-3">{error}</p>
        <button
          onClick={() => fetchRxHistory(patientId, filter === "all" ? undefined : filter)}
          className="px-4 py-2 rounded-lg text-caption font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--accent-dim)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const filters: { key: ModalityFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "glasses", label: "Glasses" },
    { key: "contact_lens", label: "Contact Lens" },
  ];

  const columns = [
    { key: "date", label: "Date", width: "w-28" },
    { key: "provider", label: "Provider", width: "w-32" },
    { key: "modality", label: "Type", width: "w-24" },
    { key: "odSph", label: "OD Sph", width: "w-20" },
    { key: "odCyl", label: "OD Cyl", width: "w-20" },
    { key: "odAxis", label: "OD Axis", width: "w-20" },
    { key: "odAdd", label: "OD Add", width: "w-20" },
    { key: "osSph", label: "OS Sph", width: "w-20" },
    { key: "osCyl", label: "OS Cyl", width: "w-20" },
    { key: "osAxis", label: "OS Axis", width: "w-20" },
    { key: "osAdd", label: "OS Add", width: "w-20" },
  ];

  return (
    <div className="space-y-4">
      {/* Modality filter */}
      <div className="flex items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--accent-dim)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {rxHistory.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="5" width="14" height="10" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 9h8M6 12h5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)]">No finalized prescriptions on file</p>
        </div>
      ) : (
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
              {rxHistory.map((row, idx) => {
                const dateStr = formatClinicDate(row.encounterDate);
                return (
                  <tr
                    key={`${row.encounterId}-${row.rxType}`}
                    className={`border-b border-[var(--border-subtle)] last:border-b-0 ${
                      idx % 2 === 0 ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-elevated)]"
                    } hover:bg-[var(--accent-dim)] transition-colors`}
                  >
                    <td className="px-3 py-2 text-[var(--text-primary)] font-medium">
                      {dateStr}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {row.providerName || "--"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={row.rxModality === "glasses" ? "default" : "secondary"}>
                        {row.rxModality === "glasses" ? "Glasses" : "CL"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.odSphere)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.odCylinder)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatAxis(row.odAxis)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.odAdd)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.osSphere)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.osCylinder)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatAxis(row.osAxis)}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs">
                      {formatRx(row.osAdd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
