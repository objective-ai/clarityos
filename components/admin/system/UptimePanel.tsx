"use client";

import { useEffect, useState } from "react";
import type { UptimeSummary } from "@/types/system";

interface Props {
  refreshKey: number;
}

export function UptimePanel({ refreshKey }: Props) {
  const [data, setData] = useState<UptimeSummary | null>(null);

  useEffect(() => {
    let ok = true;
    fetch("/api/system/uptime")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: UptimeSummary) => {
        if (ok) setData(d);
      })
      .catch(() => {
        /* ignore — panel shows loading fallback */
      });
    return () => {
      ok = false;
    };
  }, [refreshKey]);

  return (
    <div className="glass-card p-5">
      <h2 className="text-lg font-medium mb-4">Uptime &amp; Deploy</h2>
      {data ? (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="7-day Uptime" value={`${data.uptimePct.toFixed(2)}%`} />
          <Stat
            label="Samples"
            value={`${data.samplesGreen}/${data.samplesTotal}`}
          />
          <Stat
            label="Window Start"
            value={
              data.windowStart
                ? new Date(data.windowStart).toLocaleString()
                : "—"
            }
          />
          <Stat
            label="Window End"
            value={
              data.windowEnd ? new Date(data.windowEnd).toLocaleString() : "—"
            }
          />
        </dl>
      ) : (
        <div className="text-[var(--text-muted)]">Loading uptime…</div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[var(--text-muted)] text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
