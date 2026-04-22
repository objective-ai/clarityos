"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/store/sessionStore";
import { ClockStatus, camelizeClockStatus } from "@/types/staffSchedule";

export default function ClockInButton() {
  const session = useSession();
  const staffId = session?.user?.staffId;
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<string>("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!staffId) return;
    (async () => {
      try {
        const res = await fetch("/api/staff-schedule/clock-status/");
        if (!res.ok) return;
        const raw = await res.json();
        setStatus(camelizeClockStatus(raw));
      } catch {
        /* transient network error — keep status null, retry on next mount */
      }
    })();
  }, [staffId]);

  useEffect(() => {
    function compute() {
      if (!status?.clockedIn || !status.clockInAt) {
        setElapsed("");
        return;
      }
      const start = new Date(status.clockInAt).getTime();
      const diffMs = Date.now() - start;
      const totalMin = Math.max(0, Math.floor(diffMs / 60000));
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      setElapsed(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    compute();
    if (status?.clockedIn) {
      tickRef.current = setInterval(compute, 30_000);
      return () => {
        if (tickRef.current) clearInterval(tickRef.current);
      };
    }
  }, [status?.clockedIn, status?.clockInAt]);

  async function handleClick() {
    if (!staffId || loading) return;
    setLoading(true);
    try {
      const path = status?.clockedIn
        ? "/api/staff-schedule/clock-out/"
        : "/api/staff-schedule/clock-in/";
      const res = await fetch(path, { method: "POST" });
      if (res.status === 409 || res.ok) {
        const r2 = await fetch("/api/staff-schedule/clock-status/");
        if (r2.ok) setStatus(camelizeClockStatus(await r2.json()));
      }
    } catch {
      /* transient network error — loading spinner clears, status unchanged */
    }
    setLoading(false);
  }

  if (!staffId) return null;

  const isIn = !!status?.clockedIn;
  const label = loading ? "…" : isIn ? "Clock Out" : "Clock In";

  return (
    <button
      data-testid="topnav-clock-button"
      onClick={handleClick}
      disabled={loading}
      aria-label={isIn ? "Clock out" : "Clock in"}
      title={
        isIn && status?.clockInAt
          ? `Clocked in at ${new Date(status.clockInAt).toLocaleTimeString()}`
          : "Clock in"
      }
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        isIn
          ? "bg-[#2DD4BF] text-black hover:bg-[#25b8a4]"
          : "bg-white/10 text-white/80 hover:bg-white/20",
      ].join(" ")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{label}</span>
      {isIn && elapsed && (
        <span data-testid="topnav-clock-elapsed" className="tabular-nums">
          · {elapsed}
        </span>
      )}
    </button>
  );
}
