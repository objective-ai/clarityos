"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { usePatientStore } from "@/store/patientStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Search input with debounce
// ---------------------------------------------------------------------------

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        placeholder="Search patients..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass-input pl-9 pr-4 py-2 w-full max-w-sm text-body"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatientsPage() {
  const { has } = useEntitlements();
  const { tenant } = useParams<{ tenant: string }>();

  const patients = usePatientStore((s) => s.patients);
  const totalPatients = usePatientStore((s) => s.totalPatients);
  const listLoading = usePatientStore((s) => s.listLoading);
  const listError = usePatientStore((s) => s.listError);
  const fetchPatients = usePatientStore((s) => s.fetchPatients);
  const searchQuery = usePatientStore((s) => s.searchQuery);
  const setSearchQuery = usePatientStore((s) => s.setSearchQuery);

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
      fetchPatients(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery, fetchPatients]);

  // Initial load
  useEffect(() => {
    fetchPatients(searchQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subtitle
  useEffect(() => {
    setSubtitle(`${totalPatients} patient${totalPatients !== 1 ? "s" : ""} on file`);
    return () => setSubtitle(null);
  }, [totalPatients, setSubtitle]);

  if (!has(Entitlement.PATIENT_DEMOGRAPHICS)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Patient Records Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Upgrade your plan to access patient demographics.
          </p>
        </div>
      </div>
    );
  }

  function formatDate(dateStr: string) {
    return formatClinicDate(dateStr);
  }

  function calculateAge(dob: string): number {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  function sexLabel(sex: string): string {
    switch (sex) {
      case "male": return "M";
      case "female": return "F";
      case "other": return "O";
      default: return "--";
    }
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Toolbar: search left */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <SearchInput value={localSearch} onChange={setLocalSearch} />
      </div>

      {/* Error */}
      {listError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
          <span className="flex-1">{listError}</span>
        </div>
      )}

      {/* Loading */}
      {listLoading && patients.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-body">Loading patients...</span>
          </div>
        </div>
      )}

      {/* Empty */}
      {!listLoading && patients.length === 0 && !listError && (
        <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">
              {localSearch ? "No patients found" : "No patients on file"}
            </p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              {localSearch
                ? "Try a different search term."
                : "Create your first patient to get started."}
            </p>
          </div>
        </div>
      )}

      {/* Patient table */}
      {patients.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  DOB / Age
                </th>
                <th className="px-4 py-3 text-center text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  Sex
                </th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-caption text-[var(--text-muted)] uppercase tracking-wider font-medium">
                  Last Visit
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient, idx) => (
                <tr
                  key={patient.id}
                  className={`border-b border-[var(--border-subtle)] last:border-b-0 ${
                    idx % 2 === 0
                      ? "bg-[var(--bg-surface)]"
                      : "bg-[var(--bg-elevated)]"
                  } hover:bg-[var(--accent-dim)] transition-colors cursor-pointer`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/${tenant}/patients/${patient.chartNumber}`}
                      className="flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-caption font-medium text-[var(--accent)]">
                        {patient.firstName[0]}
                        {patient.lastName[0]}
                      </div>
                      <div>
                        <p className="text-body font-medium text-[var(--text-primary)]">
                          {patient.lastName}, {patient.firstName}
                          {patient.preferredName
                            ? ` (${patient.preferredName})`
                            : ""}
                        </p>
                        {patient.email && (
                          <p className="text-caption text-[var(--text-muted)]">
                            {patient.email}
                          </p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {formatDate(patient.dob)}{" "}
                    <span className="text-[var(--text-muted)]">
                      ({calculateAge(patient.dob)})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className="text-xs">
                      {sexLabel(patient.sex)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {patient.phone ?? "--"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {patient.lastVisit ? formatDate(patient.lastVisit) : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
