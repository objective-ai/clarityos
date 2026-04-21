"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@/types/system";

const dotColor = (status: string) =>
  status === "ok"
    ? "bg-[#2DD4BF]"
    : status === "degraded"
    ? "bg-amber-400"
    : "bg-red-500";

interface Props {
  refreshKey: number;
  onFetched?: () => void;
}

export function ServiceHealthPanel({ refreshKey, onFetched }: Props) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    fetch("/api/system/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: HealthResponse) => {
        if (!ok) return;
        setData(d);
        setError(null);
        onFetched?.();
      })
      .catch((e) => {
        if (ok) setError(String(e));
      });
    return () => {
      ok = false;
    };
  }, [refreshKey, onFetched]);

  return (
    <div className="glass-card p-5">
      <h2 className="text-lg font-medium mb-4">Service Health</h2>
      {error && (
        <div className="text-red-400 text-sm" data-testid="health-error">
          Health probe failed: {error}
        </div>
      )}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthCard name="FastAPI" status={data.api} latencyMs={null} />
          <HealthCard
            name="Postgres"
            status={data.postgres.status}
            latencyMs={data.postgres.latencyMs}
          />
          <HealthCard
            name="Supabase Auth"
            status={data.supabaseAuth.status}
            latencyMs={data.supabaseAuth.latencyMs}
          />
        </div>
      )}
      {data && (
        <div className="mt-4 text-xs text-white/50">
          Version <span className="font-mono">{data.version}</span>
          {" · "}checked {new Date(data.checkedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function HealthCard({
  name,
  status,
  latencyMs,
}: {
  name: string;
  status: string;
  latencyMs: number | null;
}) {
  return (
    <div className="border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor(status)}`}
        />
        <span className="font-medium">{name}</span>
      </div>
      <div className="mt-2 text-sm text-white/70">
        {status}
        {latencyMs !== null ? ` · ${latencyMs}ms` : ""}
      </div>
    </div>
  );
}
