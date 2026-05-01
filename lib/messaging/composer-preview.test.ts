import { describe, it, expect } from "vitest";
import { previewMessage } from "./composer-preview";
import type { ConsentFlags } from "@/types/messaging";

const fullConsent: ConsentFlags = {
  smsMarketing: true,
  smsOperational: true,
  emailMarketing: true,
  emailOperational: true,
  smsMarketingAt: "2026-01-01",
  smsOperationalAt: "2026-01-01",
  emailMarketingAt: "2026-01-01",
  emailOperationalAt: "2026-01-01",
  smsOptedOutAt: null,
  pausedUntil: null,
};

describe("previewMessage", () => {
  it("renders tokens and counts segments for operational SMS", () => {
    const r = previewMessage({
      body: "Hi {{patient_first_name}}",
      tokens: { patient_first_name: "Jane" },
      channel: "sms",
      purpose: "operational",
      consents: fullConsent,
    });
    expect(r.rendered).toBe("Hi Jane");
    expect(r.blocked).toBe(false);
    expect(r.segments?.count).toBe(1);
  });

  it("blocks SMS when smsOptedOutAt is set", () => {
    const r = previewMessage({
      body: "Hi",
      tokens: {},
      channel: "sms",
      purpose: "operational",
      consents: { ...fullConsent, smsOptedOutAt: "2026-04-01" },
    });
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe("OPT_OUT");
  });

  it("blocks when pausedUntil is set", () => {
    const r = previewMessage({
      body: "Hi",
      tokens: {},
      channel: "email",
      purpose: "operational",
      consents: { ...fullConsent, pausedUntil: "2026-12-01" },
    });
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe("PAUSED");
  });

  it("soft-warns (NOT blocks) when PHI in operational SMS", () => {
    const r = previewMessage({
      body: "Glaucoma follow-up",
      tokens: {},
      channel: "sms",
      purpose: "operational",
      consents: fullConsent,
    });
    expect(r.blocked).toBe(false);
    expect(r.softWarn).toBe(true);
    expect(r.phiResult?.hasPhi).toBe(true);
  });

  it("blocks marketing SMS when smsMarketing is false", () => {
    const r = previewMessage({
      body: "Sale today",
      tokens: {},
      channel: "sms",
      purpose: "marketing",
      consents: { ...fullConsent, smsMarketing: false },
    });
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe("OPT_OUT");
  });

  it("does not run PHI scan on email channel", () => {
    const r = previewMessage({
      body: "Glaucoma checkup",
      tokens: {},
      channel: "email",
      purpose: "operational",
      consents: fullConsent,
    });
    expect(r.phiResult).toBeNull();
    expect(r.softWarn).toBe(false);
  });

  it("leaves unknown tokens untouched", () => {
    const r = previewMessage({
      body: "Hi {{unknown_token}}",
      tokens: {},
      channel: "sms",
      purpose: "operational",
      consents: fullConsent,
    });
    expect(r.rendered).toBe("Hi {{unknown_token}}");
  });
});
