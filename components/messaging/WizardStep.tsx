"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WizardStepProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  active: boolean;
  completed: boolean;
  children: React.ReactNode;
  onContinue?: () => void;
  onBack?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  isContinueLoading?: boolean;
}

export function WizardStep({
  stepNumber,
  totalSteps,
  title,
  active,
  completed,
  children,
  onContinue,
  onBack,
  continueLabel = "Continue",
  continueDisabled,
  isContinueLoading,
}: WizardStepProps) {
  return (
    <section
      className={cn(
        "glass-card rounded-2xl p-6 transition-all",
        active && "border-l-4"
      )}
      style={
        active
          ? { borderLeftColor: "var(--accent)" }
          : undefined
      }
      aria-current={active ? "step" : undefined}
    >
      <header className="mb-3 flex items-center gap-2">
        <span
          className="text-caption uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Step {stepNumber} of {totalSteps}
        </span>
        {completed && (
          <CheckCircle2
            size={16}
            style={{ color: "var(--state-normal)" }}
            aria-label="Completed"
          />
        )}
      </header>
      <h2 className="text-subhead mb-4" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <div className="text-body" style={{ minHeight: "200px" }}>
        {children}
      </div>
      {(onBack || onContinue) && (
        <footer className="mt-6 flex items-center justify-between gap-3">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {onContinue && (
            <Button
              type="button"
              onClick={onContinue}
              disabled={continueDisabled || isContinueLoading}
            >
              {isContinueLoading && (
                <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />
              )}
              {continueLabel}
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}
