"use client";

import type { DailyCloseBucket } from "@/types/sales";

/**
 * Reusable daily-close section card — glass-card with an overline title and a
 * key / count / total table. Used for "By payment method" and "By category".
 */

export function DailyCloseTotalsCard({
  title,
  rows,
}: {
  title: string;
  rows: DailyCloseBucket[];
}) {
  return (
    <section className="glass-card" style={{ padding: "24px" }}>
      <p className="text-overline mb-3" style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          No activity.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left text-overline py-2" style={{ color: "var(--text-muted)" }}>
                Type
              </th>
              <th className="text-right text-overline py-2" style={{ color: "var(--text-muted)" }}>
                Count
              </th>
              <th className="text-right text-overline py-2" style={{ color: "var(--text-muted)" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="py-2 text-body capitalize" style={{ color: "var(--text-primary)" }}>
                  {row.key.replace(/_/g, " ")}
                </td>
                <td className="py-2 text-body text-right font-mono-data" style={{ color: "var(--text-secondary)" }}>
                  {row.count}
                </td>
                <td className="py-2 text-body text-right font-mono-data" style={{ color: "var(--text-primary)" }}>
                  ${Number(row.total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
