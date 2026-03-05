"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCurrentTenant } from "@/store/sessionStore";
import { useCurrentUser } from "@/store/sessionStore";
import { useEncounterStore } from "@/store/encounterStore";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { PatientChartModal } from "@/components/PatientChartModal";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

const QUICK_ACTIONS = [
  {
    href: "schedule",
    title: "View Schedule",
    description: "Manage today's appointments and upcoming visits",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 8h16" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6 1.5v4M14 1.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "patients",
    title: "Patient Lookup",
    description: "Search and manage patient demographics and records",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "encounter/enc-001",
    title: "Demo Encounter",
    description: "Open the clinical exam workspace with refraction grid",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 2v3M10 15v3M2 10h3M15 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

const FALLBACK_ENCOUNTERS = [
  { name: "Margaret Chen", date: "Today, 1:15 PM", status: "in_exam", id: "enc-001" },
  { name: "Robert Kim", date: "Today, 11:30 AM", status: "finalized", id: "enc-002" },
  { name: "Sarah Johnson", date: "Yesterday, 3:45 PM", status: "finalized", id: "enc-003" },
  { name: "Emily Davis", date: "Yesterday, 2:00 PM", status: "finalized", id: "enc-004" },
];

function formatEncounterDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
}

export default function DashboardPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { planName } = useEntitlements();
  const tenant = useCurrentTenant();
  const user = useCurrentUser();
  const base = `/${params.tenantId}`;
  const [chartOpen, setChartOpen] = useState(false);

  const encounters = useEncounterStore((s) => s.encounters);

  const stats = useMemo(() => {
    const all = Object.values(encounters);
    const total = all.length;
    const finalized = all.filter((e) => e.isFinalized).length;
    const pending = total - finalized;
    return { total, finalized, pending };
  }, [encounters]);

  const recentEncounters = useMemo(() => {
    const entries = Object.entries(encounters);
    if (entries.length === 0) return null; // use fallback
    return entries
      .map(([id, enc]) => ({
        id,
        name: enc.providerName,
        date: formatEncounterDate(enc.encounterDate),
        status: enc.status,
      }))
      .sort((a, b) => {
        const encA = encounters[a.id];
        const encB = encounters[b.id];
        return new Date(encB.encounterDate).getTime() - new Date(encA.encounterDate).getTime();
      })
      .slice(0, 4);
  }, [encounters]);

  const displayEncounters = recentEncounters ?? FALLBACK_ENCOUNTERS;

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Welcome Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-display">
            Welcome back, {user?.fullName?.split(" ")[0] ?? "Doctor"}
          </h1>
          <p className="text-body mt-1">
            {tenant?.clinicName ?? "Clinic"} &middot;{" "}
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Badge variant="default">{planName} Plan</Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href={`${base}/schedule`} className="no-underline h-full">
          <StatCard
            label="Total Encounters"
            value={stats.total}
            className="h-full"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M2 8h16" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            }
          />
        </Link>
        <StatCard
          label="Finalized"
          value={stats.finalized}
          accent
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
        />
        <StatCard
          label="Pending"
          value={stats.pending}
        />
        <StatCard
          label="Next Patient"
          value="—"
          trend="No schedule yet"
          onClick={() => setChartOpen(true)}
        />
      </div>

      {/* Quick Actions + Recent — 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-overline">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={`${base}/${action.href}`}
                className="glass-card glass-card-hover p-4 flex items-center gap-4 no-underline"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)]">
                  {action.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-subhead">{action.title}</div>
                  <p className="text-caption mt-0.5 text-[var(--text-muted)]">
                    {action.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Encounters */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-[16px]">Recent Encounters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col">
              {displayEncounters.map((enc, i) => (
                <Link
                  key={enc.id}
                  href={`${base}/encounter/${enc.id}`}
                  className="flex items-center justify-between py-3.5 hover-row rounded-lg px-3 -mx-3 no-underline"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)] font-mono">
                      {enc.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {enc.name}
                      </span>
                      <span className="text-caption ml-2 text-[var(--text-muted)]">
                        {enc.date}
                      </span>
                    </div>
                  </div>
                  <Badge variant={enc.status === "finalized" ? "success" : enc.status === "in_exam" ? "warning" : "secondary"}>
                    {enc.status === "finalized" ? "Finalized" : enc.status === "in_exam" ? "In Exam" : "Pre-Test"}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <PatientChartModal
        patientId="pat-001"
        open={chartOpen}
        onOpenChange={setChartOpen}
      />
    </div>
  );
}
