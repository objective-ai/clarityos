"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCurrentTenant, useCurrentUser } from "@/store/sessionStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
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

const INTAKE_ACTION = {
  href: "/intake",
  absolute: true,
  title: "Intake Form",
  description: "Patient-facing intake form — share via link or QR code",
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="3" width="12" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 3V2a2.5 2.5 0 015 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.5 9h5M7.5 12h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

const ADMIN_ACTION = {
  href: "admin",
  title: "Admin Settings",
  description: "Manage staff, roles, and clinic configuration",
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16.2 12.2a1.3 1.3 0 00.26 1.43l.05.05a1.58 1.58 0 11-2.24 2.24l-.05-.05a1.3 1.3 0 00-1.43-.26 1.3 1.3 0 00-.79 1.19v.14a1.58 1.58 0 11-3.16 0v-.07A1.3 1.3 0 008 15.67a1.3 1.3 0 00-1.43.26l-.05.05a1.58 1.58 0 11-2.24-2.24l.05-.05A1.3 1.3 0 004.6 12.2a1.3 1.3 0 00-1.19-.79h-.14a1.58 1.58 0 110-3.16h.07A1.3 1.3 0 004.53 7.4a1.3 1.3 0 00-.26-1.43l-.05-.05a1.58 1.58 0 112.24-2.24l.05.05A1.3 1.3 0 007.94 4a1.3 1.3 0 00.79-1.19v-.14a1.58 1.58 0 113.16 0v.07a1.3 1.3 0 00.79 1.19 1.3 1.3 0 001.43-.26l.05-.05a1.58 1.58 0 112.24 2.24l-.05.05a1.3 1.3 0 00-.26 1.43 1.3 1.3 0 001.19.79h.14a1.58 1.58 0 110 3.16h-.07a1.3 1.3 0 00-1.19.79z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

const BASE_ACTIONS = [
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
  params: { tenant: string };
}) {
  const { planName, requireRole } = useEntitlements();
  const tenant = useCurrentTenant();
  const user = useCurrentUser();
  const isAdmin = requireRole("admin", "owner");
  const base = `/${params.tenant}`;
  const [chartOpen, setChartOpen] = useState(false);

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);
  const encounters = useEncounterStore((s) => s.encounters);

  useEffect(() => {
    const firstName = (() => {
      const parts = user?.fullName?.split(" ") ?? [];
      const hasTitle = parts[0]?.endsWith(".");
      return hasTitle ? parts.slice(0, 2).join(" ") : (parts[0] ?? "Doctor");
    })();
    setSubtitle(`Welcome back, ${firstName}`);
    return () => setSubtitle(null);
  }, [user?.fullName, setSubtitle]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const todayEncounters = Object.values(encounters).filter(
      (e) => new Date(e.encounterDate).toDateString() === today
    );
    const total = todayEncounters.length;
    const finalized = todayEncounters.filter((e) => e.isFinalized).length;
    const pending = total - finalized;
    return { total, finalized, pending };
  }, [encounters]);

  const recentEncounters = useMemo(() => {
    const entries = Object.entries(encounters);
    if (entries.length === 0) return [];
    return entries
      .map(([id, enc]) => ({
        id,
        shortId: enc.shortId ?? id,
        name: enc.patientName ?? "Unknown Patient",
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

  return (
    <div className="flex flex-col gap-6 stagger">
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
            {[...BASE_ACTIONS, isAdmin ? ADMIN_ACTION : INTAKE_ACTION].map((action) => (
              <Link
                key={action.href}
                href={"absolute" in action && action.absolute ? action.href : `${base}/${action.href}`}
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
            {recentEncounters.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-muted)]">
                <p className="text-sm">No encounters yet</p>
                <p className="text-xs mt-1">Encounters will appear here once patients are seen</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {recentEncounters.map((enc, i) => (
                  <Link
                    key={enc.id}
                    href={`${base}/encounter/${enc.shortId}`}
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
            )}
          </CardContent>
        </Card>
      </div>
      {chartOpen && (
        <PatientChartModal
          patientId=""
          open={chartOpen}
          onOpenChange={setChartOpen}
        />
      )}
    </div>
  );
}
