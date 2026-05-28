"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

/**
 * Stripe Elements + PaymentElement wrapper.
 *
 * Pitfall 9 (RESEARCH): `redirect: 'if_required'` keeps SCA inline — we only
 * leave the page when Stripe demands it. On success the server is the source
 * of truth, NOT `stripe.confirmPayment`'s response: we call
 * `onSuccess(paymentIntentId)` and the parent posts to
 * `/api/sales/{id}/payments/stripe-confirm/` which re-retrieves the intent.
 *
 * Uses `PaymentElement` (the current payment-method-agnostic surface, which
 * supports Apple Pay / Link / regional methods) — never the legacy
 * single-method element variant.
 */

export interface StripePaymentFormProps {
  saleId: string;
  amount: string;
  publishableKey: string;
  clientSecret: string;
  paymentId: string;
  onSuccess: (paymentIntentId: string) => void | Promise<void>;
  onCancelAttempt: (paymentId: string) => void | Promise<void>;
  onSwitchToCash?: () => void;
}

/** Cache loadStripe Promises per publishable key (Stripe SDK requirement). */
const stripePromiseCache: Record<string, Promise<Stripe | null>> = {};

function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromiseCache[publishableKey]) {
    stripePromiseCache[publishableKey] = loadStripe(publishableKey);
  }
  return stripePromiseCache[publishableKey];
}

export function StripePaymentForm(props: StripePaymentFormProps) {
  const stripePromise = useMemo(
    () => getStripePromise(props.publishableKey),
    [props.publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#2DD4BF",
            colorBackground: "rgba(255,255,255,0.04)",
            colorText: "var(--text-primary)",
            fontFamily: "var(--font-jakarta), sans-serif",
          },
        },
      }}
    >
      <StripePaymentFormInner {...props} />
    </Elements>
  );
}

/* ------------------------------------------------------------------ */
/* Inner (must live inside <Elements> to use useStripe / useElements)  */
/* ------------------------------------------------------------------ */

function StripePaymentFormInner({
  amount,
  paymentId,
  onSuccess,
  onCancelAttempt,
  onSwitchToCash,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
        },
        redirect: "if_required",
      });
      if (stripeError) {
        setError(
          stripeError.message ??
            "Card declined. Try a different card, switch to cash, or cancel the card attempt.",
        );
        return;
      }
      if (paymentIntent && paymentIntent.status === "succeeded") {
        await onSuccess(paymentIntent.id);
      } else if (paymentIntent) {
        setError(
          `Card payment is in state "${paymentIntent.status}". Try again or switch payment methods.`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't reach Stripe. Check your internet and try again in a few seconds.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (submitting) return;
    await onCancelAttempt(paymentId);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <div
          role="alert"
          className="text-caption animate-slide-down"
          style={{ color: "var(--state-critical)" }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="flex-1 py-3 rounded-md text-subhead transition-colors disabled:opacity-45"
          style={{
            background: "var(--accent)",
            color: "var(--bg-base)",
            minHeight: "44px",
          }}
        >
          {submitting ? "Charging card…" : `Charge card $${amount}`}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="px-4 py-3 rounded-md text-body transition-colors"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            minHeight: "44px",
          }}
        >
          Cancel card attempt
        </button>
      </div>

      {onSwitchToCash && (
        <button
          type="button"
          onClick={onSwitchToCash}
          disabled={submitting}
          className="text-caption underline-offset-4 hover:underline self-start"
          style={{ color: "var(--text-muted)" }}
        >
          Switch to cash
        </button>
      )}
    </form>
  );
}
