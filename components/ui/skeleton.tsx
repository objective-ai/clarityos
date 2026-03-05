"use client";

/**
 * components/ui/skeleton.tsx
 *
 * GlassCardSkeleton — shimmer loading placeholder for glass section cards.
 * Matches the glassmorphism aesthetic with animate-pulse and glass-card styling.
 */

const WIDTHS = ["60%", "75%", "90%"] as const;

export function GlassCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="glass-card animate-pulse p-6">
      {/* Title placeholder */}
      <div
        className="h-4 rounded-lg mb-5"
        style={{
          width: "33%",
          background: "var(--bg-glass)",
        }}
      />

      {/* Content row placeholders */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-lg"
            style={{
              width: WIDTHS[i % WIDTHS.length],
              background: "var(--bg-glass)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
