import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/**
 * Plan 15-09 — replaces the Wave-0 describe.skip stub. Stripe is fully mocked
 * (we never want a real loadStripe network call inside vitest), so the test
 * confirms the wrapper plumbing: Elements wrapper mounts and PaymentElement
 * renders once a clientSecret is supplied.
 */

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({ confirmPayment: vi.fn() })),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="elements-wrapper">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({}),
}));

describe("StripePaymentForm", () => {
  it("mounts Elements wrapper + PaymentElement once a clientSecret is provided", async () => {
    const { StripePaymentForm } = await import("./StripePaymentForm");
    render(
      <StripePaymentForm
        saleId="sale-1"
        amount="125.00"
        publishableKey="pk_test_fake"
        clientSecret="pi_fake_secret_abc"
        paymentId="pay-1"
        onSuccess={() => {}}
        onCancelAttempt={() => {}}
      />,
    );
    expect(await screen.findByTestId("elements-wrapper")).toBeInTheDocument();
    expect(await screen.findByTestId("payment-element")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /charge card/i })).toBeEnabled();
  });
});
