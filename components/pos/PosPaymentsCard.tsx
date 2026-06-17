"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  PaymentConfigResponse,
  PaymentConfigUpdatePayload,
} from "@/types/sales";

/**
 * Admin > Payments — Stripe key configuration (OWNER-only, POS-12).
 *
 * The backend stores secret/webhook keys encrypted and only ever returns
 * presence booleans + the publishable key. This form never receives the secret
 * values back, so existing keys render as masked placeholders; to rotate, the
 * owner types the new key in plain text and confirms the destructive replace.
 */

const PK_RE = /^pk_(test|live)_[A-Za-z0-9]+$/;
const SK_RE = /^sk_(test|live)_[A-Za-z0-9]+$/;
const WH_RE = /^whsec_[A-Za-z0-9]+$/;

const KEY_FORMAT_ERROR =
  "That doesn't look like a Stripe key. Publishable keys start with pk_, secret keys with sk_.";

export function PosPaymentsCard() {
  const { role } = useEntitlements();

  const [config, setConfig] = useState<PaymentConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pubKey, setPubKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentConfigResponse>("/api/admin/payment-config/", { retries: 0 })
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        /* non-owner / not configured — leave config null */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // OWNER-only — hidden for admin and below.
  if (role !== "owner") return null;

  const pubPlaceholder = config?.stripePublishableKey
    ? `${config.stripePublishableKey.slice(0, 8)}…${config.stripePublishableKey.slice(-4)}`
    : "pk_test_…";
  const secretPlaceholder = config?.hasSecretKey ? "sk_***encrypted***" : "sk_test_…";
  const webhookPlaceholder = config?.hasWebhookSecret
    ? "whsec_***encrypted***"
    : "whsec_…";

  function handleSaveClick() {
    setError(null);
    setSaved(false);
    const fields: { value: string; re: RegExp }[] = [
      { value: pubKey, re: PK_RE },
      { value: secretKey, re: SK_RE },
      { value: webhookSecret, re: WH_RE },
    ];
    const filled = fields.filter((f) => f.value.trim() !== "");
    if (filled.length === 0) {
      setError("Enter at least one key to update.");
      return;
    }
    if (filled.some((f) => !f.re.test(f.value.trim()))) {
      setError(KEY_FORMAT_ERROR);
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmReplace() {
    setSaving(true);
    setError(null);
    const payload: PaymentConfigUpdatePayload = {};
    if (pubKey.trim()) payload.stripePublishableKey = pubKey.trim();
    if (secretKey.trim()) payload.stripeSecretKey = secretKey.trim();
    if (webhookSecret.trim()) payload.stripeWebhookSecret = webhookSecret.trim();
    try {
      await apiFetch<PaymentConfigResponse>("/api/admin/payment-config/", {
        method: "PUT",
        body: JSON.stringify(payload),
        retries: 0,
      });
      setPubKey("");
      setSecretKey("");
      setWebhookSecret("");
      setSaved(true);
      setConfirmOpen(false);
      // Refresh presence flags / publishable display.
      const cfg = await apiFetch<PaymentConfigResponse>(
        "/api/admin/payment-config/",
        { retries: 0 },
      ).catch(() => null);
      if (cfg) setConfig(cfg);
    } catch (e) {
      setConfirmOpen(false);
      setError(e instanceof Error ? e.message : KEY_FORMAT_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-card" style={{ padding: "24px", maxWidth: "640px" }}>
      <p className="text-overline mb-1" style={{ color: "var(--text-muted)" }}>
        Payments
      </p>
      <h3 className="text-subhead mb-4" style={{ color: "var(--text-primary)" }}>
        POS Payments
      </h3>

      {loading ? (
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            id="stripe-pub-key"
            label="Publishable key"
            value={pubKey}
            placeholder={pubPlaceholder}
            onChange={setPubKey}
          />
          <Field
            id="stripe-secret-key"
            label="Secret key"
            value={secretKey}
            placeholder={secretPlaceholder}
            onChange={setSecretKey}
          />
          <Field
            id="stripe-webhook-secret"
            label="Webhook signing secret"
            value={webhookSecret}
            placeholder={webhookPlaceholder}
            onChange={setWebhookSecret}
          />

          {/* Sales tax rate — read-only for Phase 15 */}
          <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-body" style={{ color: "var(--text-secondary)" }} title="Configurable in a follow-up">
              Sales tax rate
            </span>
            <span className="text-body font-mono-data" style={{ color: "var(--text-primary)" }}>
              {config ? `${(Number(config.salesTaxRate) * 100).toFixed(2)}%` : "—"}
            </span>
          </div>

          {error && (
            <div role="alert" className="text-caption" style={{ color: "var(--state-critical)" }}>
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="text-caption" style={{ color: "var(--state-normal)" }}>
              Stripe configuration saved.
            </div>
          )}

          <div>
            <Button onClick={handleSaveClick}>Save Stripe configuration</Button>
          </div>
        </div>
      )}

      {/* Destructive confirmation — rotate keys */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replace Stripe configuration?</DialogTitle>
            <DialogDescription>
              The current keys will be encrypted-overwritten. Any in-flight
              PaymentIntents created with the old keys will fail. Make sure your
              Stripe Dashboard webhook endpoint is updated to match.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 px-6 pb-6">
            <Button variant="destructive" onClick={handleConfirmReplace} disabled={saving}>
              {saving ? "Replacing…" : "Replace configuration"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-overline" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="glass-input font-mono-data"
        style={{ minHeight: "44px" }}
      />
    </div>
  );
}
