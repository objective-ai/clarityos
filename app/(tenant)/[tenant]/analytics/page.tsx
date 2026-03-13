"use client";

import { useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Users, Eye, Clock, DollarSign, Lock, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { GlassCardSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalyticsStore, type DateRange } from "@/store/analyticsStore";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  teal: "#2DD4BF",
  violet: "#818CF8",
  amber: "#FBBF24",
  rose: "#FB7185",
  sky: "#38BDF8",
  muted: "#505868",
} as const;

const DATE_RANGES: DateRange[] = ["7d", "30d", "90d", "6mo"];

const CLAIM_STATUS_COLORS: Record<string, string> = {
  draft: CHART_COLORS.muted,
  ready_to_bill: CHART_COLORS.teal,
  submitted: CHART_COLORS.violet,
  accepted: CHART_COLORS.sky,
  rejected: CHART_COLORS.rose,
  paid: CHART_COLORS.amber,
};

const RX_MODALITY_LABELS: Record<string, string> = {
  glasses: "Glasses",
  contact_lens: "Contacts",
  manifest: "Manifest",
  cycloplegic: "Cycloplegic",
  both: "Both",
};

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Pad a time-series array with zero-value boundary points at dateFrom/dateTo
 * so charts show the full requested range instead of starting mid-air.
 */
function padTimeSeries<T extends { date: string }>(
  data: T[],
  dateFrom: string | null,
  dateTo: string | null,
  zeroFactory: (date: string) => T,
): T[] {
  if (!dateFrom || !dateTo || data.length === 0) return data;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const result: T[] = [];
  if (dateFrom < first) result.push(zeroFactory(dateFrom));
  result.push(...sorted);
  if (dateTo > last) result.push(zeroFactory(dateTo));
  return result;
}

interface TooltipPayload {
  name: string;
  value: number | string;
  color: string;
}

interface GlassTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  valueFormatter?: (v: number | string) => string;
}

function GlassTooltip({ active, payload, label, valueFormatter }: GlassTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-sm rounded-lg shadow-lg">
      {label && <p className="text-[var(--text-muted)] text-xs mb-1">{fmtDate(label) || label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}:{" "}
          <span className="font-mono font-medium">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex gap-1 bg-[var(--glass-bg)] border border-[var(--border-default)] rounded-lg p-1">
      {DATE_RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "px-3 py-1 rounded-md text-sm transition-colors",
            value === r
              ? "bg-[var(--accent)] text-black font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full rounded-lg animate-pulse"
      style={{ height, background: "var(--bg-glass, rgba(255,255,255,0.04))" }}
    />
  );
}

function ChartErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--text-muted)]">
      <p className="text-sm">Unable to load chart data</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  chart: React.ReactNode;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  height?: number;
}

function ChartCard({ title, chart, loading, error, onRetry, height = 280 }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <ChartErrorState onRetry={onRetry} />
        ) : (
          chart
        )}
      </CardContent>
    </Card>
  );
}

function EmptyStateBanner() {
  return (
    <div className="glass-card rounded-xl p-4 text-center text-[var(--text-muted)] text-sm">
      Analytics will populate as you create encounters and appointments
    </div>
  );
}

function EncounterVolumeChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<GlassTooltip />} />
        <Bar dataKey="count" name="Encounters" fill={CHART_COLORS.teal} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RevenueTrendChart({ data }: { data: { date: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<GlassTooltip valueFormatter={(v) => `$${Number(v).toFixed(2)}`} />} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={CHART_COLORS.teal}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_COLORS.teal }}
          activeDot={{ r: 5, fill: CHART_COLORS.teal }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PatientGrowthChart({ data }: { data: { date: string; newPatients: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="patientGrowthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.violet} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.violet} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<GlassTooltip />} />
        <Area
          type="monotone"
          dataKey="newPatients"
          name="New Patients"
          stroke={CHART_COLORS.violet}
          strokeWidth={2}
          fill="url(#patientGrowthGrad)"
          dot={{ r: 3, fill: CHART_COLORS.violet }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TopDiagnosesChart({ data }: { data: { icd10Code: string; description: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="description"
          width={120}
          tick={{ fill: CHART_COLORS.muted, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 16) + "\u2026" : v)}
        />
        <Tooltip content={<GlassTooltip />} />
        <Bar dataKey="count" name="Count" fill={CHART_COLORS.sky} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ClaimsPipelineChart({ data }: { data: { claimStatus: string; count: number }[] }) {
  const displayData = data.map((d) => ({
    ...d,
    name: d.claimStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={displayData} dataKey="count" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
          {displayData.map((entry) => (
            <Cell key={entry.claimStatus} fill={CLAIM_STATUS_COLORS[entry.claimStatus] ?? CHART_COLORS.muted} />
          ))}
        </Pie>
        <Tooltip content={<GlassTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: CHART_COLORS.muted, fontSize: 11 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function AppointmentUtilizationChart({
  data,
}: {
  data: { total: number; completed: number; noShow: number; cancelled: number };
}) {
  const chartData = [{ name: "Period", completed: data.completed, noShow: data.noShow, cancelled: data.cancelled }];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<GlassTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: CHART_COLORS.muted, fontSize: 11 }}>{value}</span>}
        />
        <Bar dataKey="completed" name="Completed" fill={CHART_COLORS.teal} radius={[3, 3, 0, 0]} />
        <Bar dataKey="noShow" name="No-Show" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} />
        <Bar dataKey="cancelled" name="Cancelled" fill={CHART_COLORS.rose} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RxOpticalChart({ data }: { data: { rxModality: string; count: number }[] }) {
  const displayData = data.map((d) => ({
    ...d,
    label: RX_MODALITY_LABELS[d.rxModality] ?? d.rxModality,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={displayData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<GlassTooltip />} />
        <Bar dataKey="count" name="Prescriptions" fill={CHART_COLORS.violet} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function UpsellCard() {
  const meta = ENTITLEMENT_META.advanced_analytics;
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--accent-dim)] border border-[var(--mono-border)]">
            <Lock className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-heading mb-1">{meta.label}</h2>
            <p className="text-body">{meta.description}</p>
          </div>
          <Badge variant="default">{meta.plan} Plan</Badge>
          <Button className="mt-2">Upgrade to {meta.plan}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const { has } = useEntitlements();
  const { data, loading, error, dateRange, dateFrom, dateTo, fetch, setDateRange } = useAnalyticsStore();
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  useEffect(() => {
    setSubtitle("Practice performance at a glance");
    fetch(dateRange);
    return () => setSubtitle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data && data.actualDays < data.requestedDays) {
      setSubtitle(`Practice performance \u00b7 Showing ${data.actualDays} of ${data.requestedDays} days`);
    } else {
      setSubtitle("Practice performance at a glance");
    }
  }, [data, setSubtitle]);

  if (!has(Entitlement.ADVANCED_ANALYTICS)) {
    return <UpsellCard />;
  }

  const onRetry = () => fetch(dateRange);

  const isAllEmpty =
    data !== null &&
    data.encounterVolume.length === 0 &&
    data.revenueTrend.length === 0 &&
    data.topDiagnoses.length === 0 &&
    data.claimsPipeline.length === 0 &&
    data.patientGrowth.length === 0 &&
    data.rxOpticalMetrics.length === 0;

  const fmtRevenue = (v: number | string): string => {
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const fmtDuration = (v: number | string): string => {
    const n = Number(v);
    return isNaN(n) ? String(v) : `${n}m`;
  };

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Header row: DateRangePicker top-right */}
      <div className="flex items-center justify-end">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <GlassCardSkeleton rows={2} />
            <GlassCardSkeleton rows={2} />
            <GlassCardSkeleton rows={2} />
            <GlassCardSkeleton rows={2} />
          </>
        ) : (
          <>
            <StatCard
              label="Total Patients"
              value={data?.kpiTotalPatients.value ?? 0}
              trend={
                data?.kpiTotalPatients.pctChange !== null && data?.kpiTotalPatients.pctChange !== undefined
                  ? `${data.kpiTotalPatients.pctChange >= 0 ? "+" : ""}${data.kpiTotalPatients.pctChange.toFixed(1)}% vs prior period`
                  : undefined
              }
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Exams This Period"
              value={data?.kpiExams.value ?? 0}
              trend={
                data?.kpiExams.pctChange !== null && data?.kpiExams.pctChange !== undefined
                  ? `${data.kpiExams.pctChange >= 0 ? "+" : ""}${data.kpiExams.pctChange.toFixed(1)}% vs prior period`
                  : undefined
              }
              icon={<Eye className="h-5 w-5" />}
              accent
            />
            <StatCard
              label="Avg Exam Duration"
              value={fmtDuration(data?.kpiAvgExamDuration.value ?? 0)}
              trend={
                data?.kpiAvgExamDuration.pctChange !== null && data?.kpiAvgExamDuration.pctChange !== undefined
                  ? `${data.kpiAvgExamDuration.pctChange >= 0 ? "+" : ""}${data.kpiAvgExamDuration.pctChange.toFixed(1)}% vs prior period`
                  : undefined
              }
              icon={<Clock className="h-5 w-5" />}
            />
            <StatCard
              label="Revenue"
              value={fmtRevenue(data?.kpiRevenue.value ?? 0)}
              trend={
                data?.kpiRevenue.pctChange !== null && data?.kpiRevenue.pctChange !== undefined
                  ? `${data.kpiRevenue.pctChange >= 0 ? "+" : ""}${data.kpiRevenue.pctChange.toFixed(1)}% vs prior period`
                  : undefined
              }
              icon={<DollarSign className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      {isAllEmpty && <EmptyStateBanner />}

      {/* Full-width charts */}
      <div className="grid grid-cols-1 gap-6">
        <ChartCard
          title="Encounter Volume"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={280}
          chart={
            <EncounterVolumeChart
              data={padTimeSeries(
                data?.encounterVolume ?? [],
                dateFrom,
                dateTo,
                (d) => ({ date: d, count: 0 }),
              )}
            />
          }
        />
        <ChartCard
          title="Revenue Trend"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={280}
          chart={
            <RevenueTrendChart
              data={padTimeSeries(
                data?.revenueTrend ?? [],
                dateFrom,
                dateTo,
                (d) => ({ date: d, revenue: 0 }),
              )}
            />
          }
        />
        <ChartCard
          title="Patient Growth"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={280}
          chart={
            <PatientGrowthChart
              data={padTimeSeries(
                data?.patientGrowth ?? [],
                dateFrom,
                dateTo,
                (d) => ({ date: d, newPatients: 0 }),
              )}
            />
          }
        />
      </div>

      {/* Half-width charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Top Diagnoses"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={240}
          chart={<TopDiagnosesChart data={data?.topDiagnoses ?? []} />}
        />
        <ChartCard
          title="Claims Pipeline"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={240}
          chart={<ClaimsPipelineChart data={data?.claimsPipeline ?? []} />}
        />
        <ChartCard
          title="Appointment Utilization"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={240}
          chart={
            <AppointmentUtilizationChart
              data={data?.appointmentUtilization ?? { total: 0, completed: 0, noShow: 0, cancelled: 0 }}
            />
          }
        />
        <ChartCard
          title="Rx / Optical"
          loading={loading}
          error={error}
          onRetry={onRetry}
          height={240}
          chart={<RxOpticalChart data={data?.rxOpticalMetrics ?? []} />}
        />
      </div>
    </div>
  );
}
