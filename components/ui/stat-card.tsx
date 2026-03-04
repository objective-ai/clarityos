import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, trend, icon, accent, className, onClick }: StatCardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        "glass-card glass-card-hover relative overflow-hidden p-5",
        accent && "glass-card-accent",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Top accent glow line */}
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-60" />
      )}

      {/* Icon — decorative, top right */}
      {icon && (
        <div className="absolute top-4 right-4 text-[var(--text-muted)] opacity-40">
          {icon}
        </div>
      )}

      <div className="text-overline mb-3">{label}</div>
      <div
        className={cn(
          "text-display font-mono",
          accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
        )}
      >
        {value}
      </div>
      {trend && (
        <div className="text-caption mt-2 text-[var(--text-muted)]">
          {trend}
        </div>
      )}
    </div>
  );
}
