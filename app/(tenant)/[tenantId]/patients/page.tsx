"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import { Card, CardContent } from "@/components/ui/card";

const MOCK_PATIENTS = [
  { id: "pat-001", firstName: "Margaret", lastName: "Chen", dob: "1958-03-12", sex: "F", lastVisit: "2026-03-03", phone: "(555) 234-5678" },
  { id: "pat-002", firstName: "Robert", lastName: "Kim", dob: "1972-08-25", sex: "M", lastVisit: "2026-03-03", phone: "(555) 345-6789" },
  { id: "pat-003", firstName: "Sarah", lastName: "Johnson", dob: "1990-11-05", sex: "F", lastVisit: "2026-03-02", phone: "(555) 456-7890" },
  { id: "pat-004", firstName: "James", lastName: "Wilson", dob: "1965-01-18", sex: "M", lastVisit: "2026-03-03", phone: "(555) 567-8901" },
  { id: "pat-005", firstName: "Lisa", lastName: "Park", dob: "1988-07-22", sex: "F", lastVisit: "2026-03-03", phone: "(555) 678-9012" },
  { id: "pat-006", firstName: "David", lastName: "Brown", dob: "1955-04-30", sex: "M", lastVisit: "2026-03-03", phone: "(555) 789-0123" },
  { id: "pat-007", firstName: "Emily", lastName: "Davis", dob: "1995-09-14", sex: "F", lastVisit: "2026-03-03", phone: "(555) 890-1234" },
  { id: "pat-008", firstName: "Michael", lastName: "Torres", dob: "1978-12-03", sex: "M", lastVisit: "2026-02-28", phone: "(555) 901-2345" },
  { id: "pat-009", firstName: "Karen", lastName: "White", dob: "1960-06-17", sex: "F", lastVisit: "2026-02-27", phone: "(555) 012-3456" },
  { id: "pat-010", firstName: "Anna", lastName: "Lopez", dob: "1983-02-08", sex: "F", lastVisit: "2026-03-03", phone: "(555) 123-4567" },
];

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function PatientsPage() {
  const { has } = useEntitlements();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return MOCK_PATIENTS;
    const q = search.toLowerCase();
    return MOCK_PATIENTS.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.phone.includes(q)
    );
  }, [search]);

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

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-2xl">Patients</h1>
          <p className="text-body mt-1">{MOCK_PATIENTS.length} patients on file</p>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 h-11 rounded-xl text-sm glass-input"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                {["", "Name", "DOB", "Age", "Sex", "Phone", "Last Visit"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3.5 text-overline"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="hover-row border-t border-[var(--border-subtle)] cursor-pointer"
                >
                  {/* Avatar */}
                  <td className="pl-5 py-3">
                    <Link href={`/${tenantId}/patients/${p.id}`} className="block">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)] font-mono">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-semibold text-[var(--text-primary)]">
                    <Link href={`/${tenantId}/patients/${p.id}`} className="hover:text-[var(--accent)] transition-colors">
                      {p.lastName}, {p.firstName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-caption text-[var(--text-secondary)]">
                    {new Date(p.dob + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 font-mono text-caption text-[var(--text-secondary)]">
                    {calculateAge(p.dob)}
                  </td>
                  <td className="px-5 py-3 font-mono text-caption text-[var(--text-secondary)]">
                    {p.sex}
                  </td>
                  <td className="px-5 py-3 text-caption text-[var(--text-secondary)]">
                    {p.phone}
                  </td>
                  <td className="px-5 py-3 text-caption text-[var(--text-secondary)]">
                    {p.lastVisit}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-caption text-[var(--text-muted)]"
                  >
                    No patients match &quot;{search}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
