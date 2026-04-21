"use client";

import { useCallback, useEffect, useState } from "react";
import { ServiceHealthPanel } from "@/components/admin/system/ServiceHealthPanel";
import { RecentErrorsPanel } from "@/components/admin/system/RecentErrorsPanel";
import { UptimePanel } from "@/components/admin/system/UptimePanel";

const POLL_MS = 30_000;

/**
 * Admin → System Status surface (OWNER-only gating happens at the page level).
 *
 * Composes three glass-card panels:
 *   - ServiceHealthPanel (FastAPI / Postgres / Supabase Auth dots + latency)
 *   - RecentErrorsPanel  (table of ~50 unresolved Sentry issues + permalinks)
 *   - UptimePanel        (7-day uptime %, samples, window, deploy SHA)
 *
 * Refresh model:
 *   - All panels refresh on refreshKey change
 *   - Polls every 30 s
 *   - Manual "Refresh" button increments refreshKey + updates the "Updated HH:MM:SS" stamp
 */
export function SystemStatusSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const onRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastUpdated(new Date());
  }, []);

  // Initial mark + 30 s poll
  useEffect(() => {
    setLastUpdated(new Date());
    const id = setInterval(onRefresh, POLL_MS);
    return () => clearInterval(id);
  }, [onRefresh]);

  const handleFetched = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">System Status</h1>
          <p className="text-sm text-white/60 mt-1">
            Live health, errors, and uptime — owner-only.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span data-testid="system-status-updated">
            Updated{" "}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString([], { hour12: false })
              : "--:--:--"}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-md border border-white/10 hover:border-white/30 text-white"
          >
            Refresh
          </button>
        </div>
      </header>

      <ServiceHealthPanel refreshKey={refreshKey} onFetched={handleFetched} />
      <RecentErrorsPanel refreshKey={refreshKey} />
      <UptimePanel refreshKey={refreshKey} />
    </section>
  );
}

export default SystemStatusSection;
