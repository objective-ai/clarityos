import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all",
  {
    variants: {
      variant: {
        default:
          "border-[var(--mono-border)] bg-[var(--accent-dim)] text-[var(--accent)]",
        secondary:
          "border-[var(--glass-border)] bg-[var(--bg-glass)] text-[var(--text-secondary)]",
        destructive:
          "border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.10)] text-[var(--state-critical)]",
        success:
          "border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.10)] text-[var(--state-normal)]",
        warning:
          "border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.10)] text-[var(--state-warning)]",
        info:
          "border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.10)] text-[var(--state-info)]",
        outline:
          "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
