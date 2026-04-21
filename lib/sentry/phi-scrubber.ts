/**
 * PHI Scrubber — HIPAA seatbelt for Sentry events (Next.js runtime).
 *
 * Every event emitted from the browser and Next.js server runtime passes
 * through {@link scrubEvent} via Sentry's beforeSend hook (wired in Plan
 * 10.3-02). The scrubber:
 *
 *   1. Inspects the original exception and DROPS noise we don't want to see
 *      (NEXT_REDIRECT, ClientDisconnect) by returning `null`.
 *   2. Walks event.request, event.extra, event.contexts recursively and
 *      redacts any value whose key matches {@link DENY_KEYS} (both the
 *      snake_case API shapes and camelCase frontend shapes).
 *   3. Scrubs deny-listed query-string params in request.url and breadcrumb
 *      urls/messages.
 *   4. Keeps only `event.user.id` — strips email, name, tenant_slug, role.
 *
 * The Python counterpart lives at backend/core/sentry_scrubber.py — both
 * modules share the same DENY_KEYS shape and CLINICAL_PREFIXES tuple so
 * behaviour is identical on both ends.
 */

// Structural Sentry Event shape — we avoid importing from @sentry/nextjs so
// this module builds cleanly whether or not the package is installed.
// Plan 10.3-02 may swap this for `import type { Event } from "@sentry/nextjs"`.
export interface SentryEvent {
  request?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: Array<{
    data?: Record<string, unknown>;
    message?: string;
    [k: string]: unknown;
  }>;
  user?: { id?: string | number; [k: string]: unknown };
  tags?: Record<string, string>;
  [k: string]: unknown;
}

export interface SentryHint {
  originalException?: unknown;
  [k: string]: unknown;
}

export const REDACTED = "[Filtered]" as const;

/**
 * Keys whose values MUST be scrubbed before leaving the process.
 *
 * Covers every identifier, contact field, insurance field, and free-text
 * clinical field we surface in the UI. Both snake_case (API/DB shape) and
 * camelCase (apiFetch-transformed shape) are listed so the walker catches
 * the value regardless of which layer leaked it.
 */
export const DENY_KEYS: ReadonlySet<string> = new Set<string>([
  // Identifiers
  "patient_id",
  "mrn",
  "dob",
  "date_of_birth",
  "ssn",
  // Names
  "first_name",
  "last_name",
  "full_name",
  "patient_name",
  // Contact
  "phone",
  "email",
  "address",
  "street",
  "zip",
  "postal_code",
  // Insurance
  "insurance_number",
  "member_id",
  "policy_number",
  "group_number",
  // Free text clinical
  "chief_complaint",
  "hpi",
  "assessment",
  "plan",
  "soap_text",
  "ai_summary_text",
  "note",
  "notes",
  // camelCase variants — Next.js frontend uses camelCase via apiFetch
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
]);

/**
 * Clinical API prefixes. Errors originating at these paths get their
 * request.data dropped entirely on the Python side (see
 * backend/core/sentry_scrubber.py). Exported here so Plan 10.3-02 can
 * tag events identically in the Next.js runtime.
 */
export const CLINICAL_PREFIXES: readonly string[] = [
  "/api/encounters",
  "/api/patients",
  "/api/ai-scribe",
  "/api/claims",
  "/api/vitals",
  "/api/exam-findings",
  "/api/superbills",
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function scrubValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(scrubValue);
  if (isPlainObject(value)) return scrubObject(value);
  if (typeof value === "string") return scrubUrlQuery(value);
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DENY_KEYS.has(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = scrubValue(value);
    }
  }
  return out;
}

/**
 * Scrub deny-listed values inside a URL query string. Idempotent and safe
 * to call on any string: if the input doesn't contain "?" or isn't a URL
 * the original value is returned unchanged.
 */
function scrubUrlQuery(s: string): string {
  if (!s.includes("?")) return s;
  try {
    // Support both absolute URLs and "GET https://... ?x=y" breadcrumb
    // messages by isolating the URL-ish token (first substring with "?").
    const match = s.match(/(https?:\/\/\S+|\/\S*\?\S+)/);
    if (!match) {
      // Fall back to plain query-string scrub for bare "?x=y" strings.
      return scrubBareQuery(s);
    }
    const urlToken = match[0];
    const scrubbed = scrubSingleUrl(urlToken);
    return s.replace(urlToken, scrubbed);
  } catch {
    return s;
  }
}

function scrubSingleUrl(url: string): string {
  const placeholder = "http://placeholder.invalid";
  try {
    const isAbsolute = /^https?:\/\//.test(url);
    const parsed = new URL(url, placeholder);
    let mutated = false;
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (DENY_KEYS.has(key)) {
        parsed.searchParams.set(key, REDACTED);
        mutated = true;
      }
    }
    if (!mutated) return url;
    const out = parsed.toString();
    return isAbsolute ? out : out.replace(placeholder, "");
  } catch {
    return scrubBareQuery(url);
  }
}

function scrubBareQuery(s: string): string {
  const qIdx = s.indexOf("?");
  if (qIdx < 0) return s;
  const head = s.slice(0, qIdx);
  const qs = s.slice(qIdx + 1);
  const parts = qs.split("&").map((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) return pair;
    const key = pair.slice(0, eqIdx);
    if (DENY_KEYS.has(key)) return `${key}=${encodeURIComponent(REDACTED)}`;
    return pair;
  });
  return `${head}?${parts.join("&")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrub a Sentry event before it leaves the process.
 *
 * @returns the scrubbed event, or `null` to drop the event entirely (used
 *   for NEXT_REDIRECT and ClientDisconnect noise).
 */
export function scrubEvent(event: SentryEvent, hint?: SentryHint): SentryEvent | null {
  // 1. Ignore rules — NEXT_REDIRECT is Next.js control-flow, not an error;
  //    ClientDisconnect is benign request-cancellation noise.
  const exc = hint?.originalException;
  if (exc && typeof exc === "object") {
    const name = (exc as { name?: unknown }).name;
    if (name === "NEXT_REDIRECT" || name === "ClientDisconnect") {
      return null;
    }
  }

  // 2. Deny-list scrub on the major PII-bearing buckets.
  if (isPlainObject(event.request)) {
    event.request = scrubObject(event.request);
  }
  if (isPlainObject(event.extra)) {
    event.extra = scrubObject(event.extra);
  }
  if (isPlainObject(event.contexts)) {
    event.contexts = scrubObject(event.contexts);
  }

  // 3. Breadcrumbs — urls and messages frequently contain ?mrn=... patterns.
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => {
      const next = { ...b };
      if (isPlainObject(next.data)) {
        next.data = scrubObject(next.data);
      }
      if (typeof next.message === "string") {
        next.message = scrubUrlQuery(next.message);
      }
      return next;
    });
  }

  // 4. User context — keep id ONLY.
  if (event.user && typeof event.user === "object") {
    const id = event.user.id;
    event.user = id !== undefined ? { id } : {};
  }

  return event;
}
