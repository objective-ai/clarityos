"use client";

import { useEffect } from "react";
import { Users, Eye, Clock, DollarSign, Lock, BarChart3, TrendingUp, Activity, PieChart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import { usePageHeaderStore } from "@/store/pageHeaderStore";

function ChartPlaceholder({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border-2 border-dashed border-[var(--border-default)]">
          <span className="text-[var(--text-muted)] opacity-40">{icon}</span>
          <span className="text-caption text-[var(--text-muted)]">Chart coming soon</span>
        </div>
      </CardContent>
    </Card>
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
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  useEffect(() => {
    setSubtitle("Practice performance at a glance");
    return () => setSubtitle(null);
  }, [setSubtitle]);

  if (!has(Entitlement.ADVANCED_ANALYTICS)) {
    return <UpsellCard />;
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Patients" value="1,247" trend="+23 this month" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Exams This Month" value={156} trend="+12% vs last month" icon={<Eye className="h-5 w-5" />} accent />
        <StatCard label="Avg Wait Time" value="14m" trend="-2m improvement" icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Revenue" value="$48.2K" trend="+8% vs last month" icon={<DollarSign className="h-5 w-5" />} />
      </div>

      {/* Chart Placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartPlaceholder icon={<BarChart3 className="h-8 w-8" />} label="Patient Volume" />
        <ChartPlaceholder icon={<TrendingUp className="h-8 w-8" />} label="Revenue Trend" />
        <ChartPlaceholder icon={<PieChart className="h-8 w-8" />} label="Top Diagnoses" />
        <ChartPlaceholder icon={<Activity className="h-8 w-8" />} label="Rx Trends" />
      </div>
    </div>
  );
}
