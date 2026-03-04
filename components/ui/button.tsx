import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--text-inverse)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md),var(--shadow-glow)] hover:brightness-110",
        destructive:
          "bg-[rgba(248,113,113,0.12)] text-[var(--state-critical)] border border-[rgba(248,113,113,0.25)] hover:bg-[rgba(248,113,113,0.20)]",
        outline:
          "bg-transparent text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)]",
        secondary:
          "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-glass)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-subtle)]",
        link: "underline-offset-4 hover:underline text-[var(--accent)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-8",
        icon: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
