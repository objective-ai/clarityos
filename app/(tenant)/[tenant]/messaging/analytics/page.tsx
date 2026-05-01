"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { messagingApi } from "@/lib/api/messaging";

const RANGES = [
  { id: 7, label: "7d" },
  { id: 30, label: "30d" },
  { id: 90, label: "90d" },
  { id: 365, label: "YTD" },
] as const;

interface AnalyticsResponse {
  kpis: {
    sentTotal: number;
    failedTotal: number;
    optoutsTotal: number;
    costTotalCents: number;
  };
  reminderFunnel: Array<{ status: string; count: number }>;
  recallConversion: { sent: number; booked: number };
  optoutTrend: Array<{ week: string; count: number }>;
  costVolume: Array<{
    day: string;
    channel: string;
    count: number;
    costCents: number;
  }>;
}

export default function MessagingAnalyticsPage() {
  const [range, setRange] = useState<number>(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    messagingApi
      .getAnalytics(range)
      .then((d) => setData(d as AnalyticsResponse))
      .catch((err: unknown) =>
        setLoadError(
          err instanceof Error ? err.message : "Failed to load analytics",
        ),
      )
      .finally(() => setLoading(false));
  }, [range]);

  function exportCsv(label: string, rows: Array<Record<string, unknown>>) {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => JSON.stringify(r[h] ?? "")).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `messaging-${label}-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loadError) {
    return (
      <div className="p-6" role="alert">
        <p className="text-body text-[var(--state-critical)]">
          Couldn't load analytics: {loadError}
        </p>
      </div>
    );
  }

  if (loading || !data) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-heading">Messaging Analytics</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`px-3 py-1 text-caption rounded ${
                range === r.id
                  ? "bg-[var(--accent)] text-[var(--bg-base)]"
                  : ""
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
              Sent
            </p>
            <p className="text-heading">{data.kpis.sentTotal}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
              Failed
            </p>
            <p className="text-heading text-[var(--state-critical)]">
              {data.kpis.failedTotal}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
              Opt-outs
            </p>
            <p className="text-heading">{data.kpis.optoutsTotal}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
              Cost
            </p>
            <p className="text-heading">
              ${(data.kpis.costTotalCents / 100).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Reminder Funnel</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => exportCsv("funnel", data.reminderFunnel)}
          >
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.reminderFunnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="status" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--glass-border)",
                }}
              />
              <Bar dataKey="count" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <h2 className="text-subhead">Recall Conversion</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
                Sent
              </p>
              <p className="text-heading">{data.recallConversion.sent}</p>
            </div>
            <div>
              <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
                Booked within 90d
              </p>
              <p className="text-heading text-[var(--state-normal)]">
                {data.recallConversion.booked}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Opt-out Trend</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => exportCsv("optout", data.optoutTrend)}
          >
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.optoutTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="week" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--glass-border)",
                }}
              />
              <Area
                dataKey="count"
                stroke="var(--state-warning)"
                fill="var(--state-warning)"
                fillOpacity={0.25}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Cost & Volume</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => exportCsv("cost", data.costVolume)}
          >
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.costVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="day" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--glass-border)",
                }}
              />
              <Legend />
              <Bar dataKey="count" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() =>
            alert("Compliance Report PDF generation lands in Plan 12-10")
          }
        >
          Download Compliance Report
        </Button>
      </div>
    </div>
  );
}
