"use client";

import { useState } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { usePosCartStore, selectIsClosable } from "@/store/posCartStore";

import { CashPaymentForm } from "./CashPaymentForm";
import { ExternalCardPaymentForm } from "./ExternalCardPaymentForm";
import { StripePaymentForm } from "./StripePaymentForm";
import { WriteOffPaymentForm } from "./WriteOffPaymentForm";

/**
 * Payment panel — method pills + active form + totals stack + Close sale.
 *
 * Method visibility:
 *   - cash, stripe_card, external_card: all roles with OPEN_POS (O/A/T/R)
 *   - write_off: OWNER + ADMIN only (POS-11)
 *
 * Card pill is disabled when the tenant has no Stripe publishable key —
 * tooltip surfaces the "Stripe isn't configured" copy from UI-SPEC.
 *
 * Close sale CTA is disabled until `remaining <= 0` per UI-SPEC.
 */

type Method = "cash" | "stripe_card" | "external_card" | "write_off";

export interface PaymentPanelProps {
  stripePublishableKey: string | null;
  onSaleClosed?: () => void;
}

export function PaymentPanel({
  stripePublishableKey,
  onSaleClosed,
}: PaymentPanelProps) {
  const { requireRole } = useEntitlements();
  const allowWriteOff = requireRole("owner", "admin");
  const sale = usePosCartStore((s) => s.sale);
  const closable = usePosCartStore(selectIsClosable);
  const saving = usePosCartStore((s) => s.saving);
  const closeSale = usePosCartStore((s) => s.closeSale);
  const initiateStripePayment = usePosCartStore((s) => s.initiateStripePayment);
  const confirmStripePayment = usePosCartStore((s) => s.confirmStripePayment);
  const cancelStripePayment = usePosCartStore((s) => s.cancelStripePayment);

  const [method, setMethod] = useState<Method>("cash");
  const [stripeIntent, setStripeIntent] = useState<{
    publishableKey: string;
    clientSecret: string;
    paymentId: string;
  } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (!sale) {
    return (
      <div className="glass-card" style={{ padding: "24px" }}>
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          Open a sale to start taking payments.
        </p>
      </div>
    );
  }

  const remaining = Number(sale.remaining);
  const remainingStr = Math.max(0, remaining).toFixed(2);
  const stripeConfigured = !!stripePublishableKey;

  async function handlePickStripe() {
    if (!stripeConfigured) return;
    setMethod("stripe_card");
    setCloseError(null);
    try {
      const intent = await initiateStripePayment(remainingStr);
      setStripeIntent({
        publishableKey: intent.publishableKey,
        clientSecret: intent.clientSecret,
        paymentId: intent.paymentId,
      });
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Failed to start card payment");
    }
  }

  async function handleStripeSuccess(paymentIntentId: string) {
    await confirmStripePayment(paymentIntentId);
    setStripeIntent(null);
  }

  async function handleStripeCancel(paymentId: string) {
    await cancelStripePayment(paymentId);
    setStripeIntent(null);
  }

  async function handleClose() {
    setCloseError(null);
    try {
      await closeSale();
      onSaleClosed?.();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Failed to close sale");
    }
  }

  return (
    <div className="glass-card flex flex-col gap-6" style={{ padding: "24px" }}>
      {/* totals */}
      <div className="flex flex-col gap-2">
        <Totals label="Subtotal" amount={sale.subtotal} />
        <Totals label="Discount" amount={`-${sale.discountTotal}`} />
        <Totals label="Tax" amount={sale.tax} />
        <div
          style={{ borderTop: "1px solid var(--border-default)", paddingTop: "8px" }}
        >
          <Totals label="Total" amount={sale.total} emphasis />
        </div>
        <div
          className="text-body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            color:
              remaining > 0 ? "var(--state-warning)" : "var(--state-normal)",
          }}
        >
          <span className="text-overline">Amount remaining</span>
          <span className="font-mono-data">${remainingStr}</span>
        </div>
      </div>

      {/* method pills */}
      {sale.status === "open" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <MethodPill
              label="Cash"
              active={method === "cash"}
              onClick={() => setMethod("cash")}
            />
            <MethodPill
              label="Card"
              active={method === "stripe_card"}
              disabled={!stripeConfigured}
              title={
                stripeConfigured
                  ? undefined
                  : "Stripe isn't configured for this clinic. Ask an owner to add Stripe keys in Admin > POS Payments."
              }
              onClick={handlePickStripe}
            />
            <MethodPill
              label="External card"
              active={method === "external_card"}
              onClick={() => setMethod("external_card")}
            />
            {allowWriteOff && (
              <MethodPill
                label="Write-off"
                active={method === "write_off"}
                onClick={() => setMethod("write_off")}
              />
            )}
          </div>

          {/* form */}
          <div className="animate-fade-in-up">
            {method === "cash" && <CashPaymentForm defaultAmount={remainingStr} />}
            {method === "external_card" && (
              <ExternalCardPaymentForm defaultAmount={remainingStr} />
            )}
            {method === "write_off" && allowWriteOff && (
              <WriteOffPaymentForm defaultAmount={remainingStr} />
            )}
            {method === "stripe_card" && stripeIntent && (
              <StripePaymentForm
                saleId={sale.id}
                amount={remainingStr}
                publishableKey={stripeIntent.publishableKey}
                clientSecret={stripeIntent.clientSecret}
                paymentId={stripeIntent.paymentId}
                onSuccess={handleStripeSuccess}
                onCancelAttempt={handleStripeCancel}
                onSwitchToCash={() => {
                  setStripeIntent(null);
                  setMethod("cash");
                }}
              />
            )}
            {method === "stripe_card" && !stripeIntent && stripeConfigured && (
              <p
                className="text-caption"
                style={{ color: "var(--text-muted)" }}
              >
                Click the Card pill again to start a Stripe PaymentIntent.
              </p>
            )}
          </div>
        </>
      )}

      {/* close sale */}
      <div className="flex flex-col gap-2">
        {closeError && (
          <div
            role="alert"
            className="text-caption animate-slide-down"
            style={{ color: "var(--state-critical)" }}
          >
            {closeError}
          </div>
        )}
        <button
          type="button"
          onClick={handleClose}
          disabled={!closable || saving}
          className="py-3 rounded-md text-subhead transition-colors disabled:opacity-45"
          style={{
            background: "var(--accent)",
            color: "var(--bg-base)",
            minHeight: "44px",
            cursor: closable ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Closing…" : "Close sale"}
        </button>
        {!closable && sale.status === "open" && (
          <p className="text-caption" style={{ color: "var(--text-muted)" }}>
            {sale.payments.length === 0
              ? "Add at least one payment before closing the sale."
              : `Sale can't close — $${remainingStr} still owed. Add another payment or adjust amounts.`}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Totals({
  label,
  amount,
  emphasis,
}: {
  label: string;
  amount: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
    >
      <span
        className={emphasis ? "text-overline" : "text-overline"}
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className={
          emphasis ? "text-display font-mono-data data-value" : "text-body font-mono-data"
        }
        style={{ color: emphasis ? "var(--accent)" : "var(--text-secondary)" }}
      >
        ${Number(amount).toFixed(2)}
      </span>
    </div>
  );
}

function MethodPill({
  label,
  active,
  disabled,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-subhead rounded-md transition-colors disabled:opacity-45"
      style={{
        background: active ? "var(--accent-dim)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        border: active
          ? "1px solid var(--accent)"
          : "1px solid var(--border-default)",
        padding: "10px 16px",
        minHeight: "44px",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
