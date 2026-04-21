/**
 * Unit tests for lib/sentry/phi-scrubber — the HIPAA seatbelt.
 *
 * Coverage:
 *   - Deny-list (25 snake_case + 14 camelCase keys) redacted to "[Filtered]"
 *   - Nested objects + arrays walked recursively
 *   - URL query-string redaction (request.url, breadcrumbs[].data.url, .message)
 *   - User context stripped to { id } only
 *   - Ignore rules drop NEXT_REDIRECT and ClientDisconnect (returns null)
 *
 * See .planning/phases/10.3-error-monitoring-system-status/10.3-CONTEXT.md
 * §"PHI scrubber (deny-list)" for the canonical key list.
 */
import { describe, it, expect } from "vitest";

import {
  scrubEvent,
  DENY_KEYS,
  CLINICAL_PREFIXES,
  REDACTED,
} from "@/lib/sentry/phi-scrubber";

// Snake_case deny-list — MUST match CONTEXT §"PHI scrubber (deny-list)" verbatim.
const SNAKE_DENY_KEYS = [
  "patient_id",
  "mrn",
  "dob",
  "date_of_birth",
  "ssn",
  "first_name",
  "last_name",
  "full_name",
  "patient_name",
  "phone",
  "email",
  "address",
  "street",
  "zip",
  "postal_code",
  "insurance_number",
  "member_id",
  "policy_number",
  "group_number",
  "chief_complaint",
  "hpi",
  "assessment",
  "plan",
  "soap_text",
  "ai_summary_text",
  "note",
  "notes",
] as const;

// CamelCase variants — Next.js frontend transforms via apiFetch's camelizeKeys.
const CAMEL_DENY_KEYS = [
  "patientId",
  "dateOfBirth",
  "firstName",
  "lastName",
  "fullName",
  "patientName",
  "postalCode",
  "insuranceNumber",
  "memberId",
  "policyNumber",
  "groupNumber",
  "chiefComplaint",
  "soapText",
  "aiSummaryText",
] as const;

describe("REDACTED constant", () => {
  it("is the literal string [Filtered]", () => {
    expect(REDACTED).toBe("[Filtered]");
  });
});

describe("DENY_KEYS export", () => {
  it("contains every snake_case deny-list key", () => {
    for (const k of SNAKE_DENY_KEYS) {
      expect(DENY_KEYS.has(k)).toBe(true);
    }
  });

  it("contains every camelCase deny-list key", () => {
    for (const k of CAMEL_DENY_KEYS) {
      expect(DENY_KEYS.has(k)).toBe(true);
    }
  });
});

describe("CLINICAL_PREFIXES export", () => {
  it("lists every clinical route prefix", () => {
    expect(CLINICAL_PREFIXES).toEqual([
      "/api/encounters",
      "/api/patients",
      "/api/ai-scribe",
      "/api/claims",
      "/api/vitals",
      "/api/exam-findings",
      "/api/superbills",
    ]);
  });
});

describe("scrubEvent — deny-list redaction", () => {
  it("redacts every snake_case key at the top of event.extra", () => {
    const extra: Record<string, unknown> = {};
    for (const k of SNAKE_DENY_KEYS) {
      extra[k] = "secret-value";
    }
    const event = scrubEvent({ extra } as any);
    expect(event).not.toBeNull();
    for (const k of SNAKE_DENY_KEYS) {
      expect((event as any).extra[k]).toBe(REDACTED);
    }
  });

  it("redacts every camelCase key at the top of event.extra", () => {
    const extra: Record<string, unknown> = {};
    for (const k of CAMEL_DENY_KEYS) {
      extra[k] = "secret-value";
    }
    const event = scrubEvent({ extra } as any);
    expect(event).not.toBeNull();
    for (const k of CAMEL_DENY_KEYS) {
      expect((event as any).extra[k]).toBe(REDACTED);
    }
  });

  it("leaves non-deny keys untouched", () => {
    const event = scrubEvent({
      extra: { patient_id: "p1", safe_key: "visible", count: 42 },
    } as any);
    expect(event).not.toBeNull();
    expect((event as any).extra.patient_id).toBe(REDACTED);
    expect((event as any).extra.safe_key).toBe("visible");
    expect((event as any).extra.count).toBe(42);
  });

  it("redacts nested objects recursively", () => {
    const event = scrubEvent({
      extra: { a: { b: { patient_id: "X", inner: { mrn: "Y" } } } },
    } as any);
    expect(event).not.toBeNull();
    const a = (event as any).extra.a;
    expect(a.b.patient_id).toBe(REDACTED);
    expect(a.b.inner.mrn).toBe(REDACTED);
  });

  it("redacts every item in array-valued deny keys", () => {
    const event = scrubEvent({
      extra: { records: [{ mrn: "A" }, { mrn: "B" }] },
    } as any);
    expect(event).not.toBeNull();
    const records = (event as any).extra.records;
    expect(records[0].mrn).toBe(REDACTED);
    expect(records[1].mrn).toBe(REDACTED);
  });

  it("scrubs keys under event.request", () => {
    const event = scrubEvent({
      request: { headers: { soap_text: "long note" } },
    } as any);
    expect(event).not.toBeNull();
    expect((event as any).request.headers.soap_text).toBe(REDACTED);
  });

  it("scrubs keys under event.contexts", () => {
    const event = scrubEvent({
      contexts: { app: { ai_summary_text: "leak" } },
    } as any);
    expect(event).not.toBeNull();
    expect((event as any).contexts.app.ai_summary_text).toBe(REDACTED);
  });
});

describe("scrubEvent — URL query-string redaction", () => {
  it("redacts deny-list values in request.url query params", () => {
    const event = scrubEvent({
      request: { url: "https://a.com/api/patients/1?mrn=ABC&ok=1" },
    } as any);
    expect(event).not.toBeNull();
    const url = (event as any).request.url as string;
    // Either literal "[Filtered]" or URL-encoded "%5BFiltered%5D" is acceptable.
    expect(url.includes("[Filtered]") || url.includes("%5BFiltered%5D")).toBe(true);
    expect(url).not.toContain("ABC");
    expect(url).toContain("ok=1");
  });

  it("leaves URLs without query strings untouched", () => {
    const event = scrubEvent({
      request: { url: "https://a.com/api/patients/1" },
    } as any);
    expect(event).not.toBeNull();
    expect((event as any).request.url).toBe("https://a.com/api/patients/1");
  });

  it("scrubs breadcrumb data url and message", () => {
    const event = scrubEvent({
      breadcrumbs: [
        {
          data: { url: "https://a.com/api/patients?mrn=Z" },
          message: "GET https://a.com/api/patients?mrn=Z",
        },
      ],
    } as any);
    expect(event).not.toBeNull();
    const b = (event as any).breadcrumbs[0];
    expect(b.data.url).not.toContain("=Z");
    expect(b.message).not.toContain("=Z");
  });
});

describe("scrubEvent — user context", () => {
  it("keeps only { id } on event.user, strips email/name/full_name/role", () => {
    const event = scrubEvent({
      user: {
        id: "u1",
        email: "x@y.com",
        full_name: "Dr Smith",
        role: "OWNER",
        tenant_slug: "clinic",
      },
    } as any);
    expect(event).not.toBeNull();
    expect((event as any).user).toEqual({ id: "u1" });
  });

  it("does not create event.user if none was present", () => {
    const event = scrubEvent({ extra: { patient_id: "p" } } as any);
    expect(event).not.toBeNull();
    expect((event as any).user).toBeUndefined();
  });
});

describe("scrubEvent — ignore rules", () => {
  it("returns null for NEXT_REDIRECT errors", () => {
    const err = new Error("redirect");
    err.name = "NEXT_REDIRECT";
    expect(scrubEvent({} as any, { originalException: err })).toBeNull();
  });

  it("returns null for ClientDisconnect errors", () => {
    const err = new Error("client disconnected");
    err.name = "ClientDisconnect";
    expect(scrubEvent({} as any, { originalException: err })).toBeNull();
  });

  it("returns the event when hint has no matching ignore rule", () => {
    const err = new Error("other failure");
    err.name = "OtherError";
    const result = scrubEvent({ extra: { safe: 1 } } as any, { originalException: err });
    expect(result).not.toBeNull();
    expect((result as any).extra.safe).toBe(1);
  });

  it("returns the event when no hint is provided", () => {
    const result = scrubEvent({ extra: { safe: 1 } } as any);
    expect(result).not.toBeNull();
  });
});
