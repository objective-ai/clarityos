"use client";

import { useState } from "react";
import { printReceipt } from "@/lib/pos/printReceipt";
import { posApi } from "@/lib/pos/api";
import type { Sale } from "@/types/sales";

/**
 * Post-close receipt delivery prompt. Three CTAs (Print / Email / Both) +
 * Skip text-only link. Closing the modal skips both — receipt remains
 * downloadable later from the Patient > Payments tab.
 *
 * Email input prefills `patient.email` and is editable in case the patient
 * gave a different email at the counter.
 */

export interface ReceiptDeliveryPromptProps {
  sale: Sale;
  patientEmail?: string | null;
  /** Called when staff dismisses the modal (skip or finish). */
  onDismiss: () => void;
}

type Action = "idle" | "print" | "email" | "both";

export function ReceiptDeliveryPrompt({
  sale,
  patientEmail,
  onDismiss,
}: ReceiptDeliveryPromptProps) {
  const [action, setAction] = useState<Action>("idle");
  const [email, setEmail] = useState(patientEmail ?? "");
  const [emailMode, setEmailMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handlePrint() {
    setAction("print");
    setError(null);
    try {
      await printReceipt(sale.id);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setAction("idle");
    }
  }

  async function handleEmail(alsoPrint: boolean) {
    if (!email) {
      setEmailMode(true);
      return;
    }
    setAction(alsoPrint ? "both" : "email");
    setError(null);
    try {
      await posApi.emailReceipt(sale.id, email);
      if (alsoPrint) await printReceipt(sale.id);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email failed");
    } finally {
      setAction("idle");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Receipt delivery"
      className="fixed inset-0 z-40 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        className="glass-card"
        style={{ width: "100%", maxWidth: "440px", padding: "24px" }}
      >
        <header className="mb-4">
          <p className="text-overline" style={{ color: "var(--text-muted)" }}>
            Sale closed
          </p>
          <p className="text-display font-mono-data data-value" style={{ color: "var(--accent)" }}>
            ${Number(sale.total).toFixed(2)}
          </p>
          {sale.receiptNumber && (
            <p className="text-caption font-mono-data" style={{ color: "var(--text-secondary)" }}>
              Receipt #{sale.receiptNumber}
            </p>
          )}
        </header>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-body" style={{ color: "var(--state-normal)" }}>
              ✓ Receipt delivered.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="py-3 rounded-md text-subhead"
              style={{
                background: "var(--accent)",
                color: "var(--bg-base)",
                minHeight: "44px",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handlePrint}
              disabled={action !== "idle"}
              className="py-3 rounded-md text-subhead disabled:opacity-45"
              style={{
                background: "var(--accent)",
                color: "var(--bg-base)",
                minHeight: "44px",
              }}
            >
              {action === "print" ? "Printing…" : "Print receipt"}
            </button>

            {emailMode && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="receipt-email"
                  className="text-overline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Email
                </label>
                <input
                  id="receipt-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="glass-input"
                  style={{ minHeight: "44px" }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => handleEmail(false)}
              disabled={action !== "idle"}
              className="py-3 rounded-md text-subhead disabled:opacity-45"
              style={{
                background: "transparent",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                minHeight: "44px",
              }}
            >
              {action === "email" ? "Emailing…" : "Email receipt"}
            </button>

            <button
              type="button"
              onClick={() => handleEmail(true)}
              disabled={action !== "idle"}
              className="py-3 rounded-md text-subhead disabled:opacity-45"
              style={{
                background: "transparent",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                minHeight: "44px",
              }}
            >
              {action === "both" ? "Sending + printing…" : "Print and email"}
            </button>

            {error && (
              <div role="alert" className="text-caption" style={{ color: "var(--state-critical)" }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onDismiss}
              className="text-caption underline-offset-4 hover:underline self-center"
              style={{ color: "var(--text-muted)", padding: "8px" }}
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
