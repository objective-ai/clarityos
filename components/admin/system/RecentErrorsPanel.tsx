"use client";

import { useEffect, useState } from "react";
import type { ErrorIssueList, ErrorIssue } from "@/types/system";

interface Props {
  refreshKey: number;
}

export function RecentErrorsPanel({ refreshKey }: Props) {
  const [data, setData] = useState<ErrorIssueList | null>(null);

  useEffect(() => {
    let ok = true;
    fetch("/api/system/errors")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ErrorIssueList) => {
        if (ok) setData(d);
      })
      .catch(() => {
        if (ok) {
          setData({
            issues: [],
            fetchedAt: new Date().toISOString(),
            cached: false,
          });
        }
      });
    return () => {
      ok = false;
    };
  }, [refreshKey]);

  return (
    <div className="glass-card p-5">
      <h2 className="text-lg font-medium mb-4">
        Recent Errors{" "}
        {data?.cached ? (
          <span className="text-xs text-white/40">(cached)</span>
        ) : null}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50">
              <th className="py-2">Title</th>
              <th>Count</th>
              <th>Last Seen</th>
              <th>Env</th>
            </tr>
          </thead>
          <tbody>
            {(data?.issues ?? []).map((i: ErrorIssue) => (
              <tr key={i.id} className="border-t border-white/5">
                <td className="py-2">
                  <a
                    href={i.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#2DD4BF] hover:underline"
                  >
                    {i.title}
                  </a>
                  {i.culprit ? (
                    <div className="text-xs text-white/40 font-mono">
                      {i.culprit}
                    </div>
                  ) : null}
                </td>
                <td>{i.count}</td>
                <td>{new Date(i.lastSeen).toLocaleString()}</td>
                <td className="text-white/60">{i.environment ?? "—"}</td>
              </tr>
            ))}
            {(!data || data.issues.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-white/50">
                  No unresolved issues.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
