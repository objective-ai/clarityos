"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import type { HealthResponse } from "@/types/system";
import { useSession } from "@/store/sessionStore";

type DotColor = "green" | "amber" | "red" | "unknown";

function rollup(d: HealthResponse | null): DotColor {
  if (!d) return "unknown";
  const values = [d.api, d.postgres?.status, d.supabaseAuth?.status].filter(
    Boolean,
  ) as string[];
  if (values.length === 0) return "unknown";
  if (values.some((v) => v === "down")) return "red";
  if (values.some((v) => v === "degraded")) return "amber";
  return "green";
}

const colorClass: Record<DotColor, string> = {
  green: "bg-[#2DD4BF]",
  amber: "bg-amber-400",
  red: "bg-red-500",
  unknown: "bg-white/30",
};

/**
 * OWNER-only health indicator pinned to the TopNav, immediately before ClockInButton.
 *
 * - Polls `/api/system/health` every 60s
 * - Dot color: all ok → green, any degraded → amber, any down → red
 * - Click → navigates to /{tenant}/admin?section=system
 * - Returns null for every non-owner session
 */
export function HealthDot() {
  const session = useSession();
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const [data, setData] = useState<HealthResponse | null>(null);

  const isOwner = session?.user?.role === "owner";

  useEffect(() => {
    if (!isOwner) return;
    let ok = true;
    const load = () => {
      fetch("/api/system/health")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: HealthResponse | null) => {
          if (ok) setData(d);
        })
        .catch(() => {
          /* keep last state on transient error */
        });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      ok = false;
      clearInterval(id);
    };
  }, [isOwner]);

  if (!isOwner) return null;

  const color = rollup(data);
  const tenantSlug = params?.tenant ?? "";

  return (
    <button
      type="button"
      aria-label={`System health: ${color}`}
      title={`System health: ${color}`}
      onClick={() => router.push(`/${tenantSlug}/admin?section=system`)}
      className="p-2 rounded-md hover:bg-white/5"
      data-testid="health-dot"
    >
      <span className={`block w-2.5 h-2.5 rounded-full ${colorClass[color]}`} />
    </button>
  );
}

export default HealthDot;
