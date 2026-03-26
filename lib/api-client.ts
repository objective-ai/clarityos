/**
 * Authenticated API client for FastAPI backend.
 *
 * Features:
 * - SSR-safe Supabase auth via createClient() from lib/supabase/client (API-08)
 * - Automatic retry with exponential backoff (default 3 retries)
 * - Transparent camelCase <-> snake_case conversion for payloads and responses
 */

import { createClient } from "@/lib/supabase/client";
import { camelizeKeys, snakifyKeys } from "@/lib/case-convert";

// Route API calls through Next.js BFF proxy (same-origin) to avoid CORS/CSP issues.
// The BFF routes in app/api/ forward requests to FastAPI with the auth token.
const API_URL = "";

/**
 * Retries an async function with exponential backoff.
 * Base delay: 500ms. Delays: 500ms, 1000ms, 2000ms for retries 1, 2, 3.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 4xx errors are client errors — retrying won't help, fail fast
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        throw err;
      }
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Returns Authorization and Content-Type headers using the SSR-safe
 * createClient() factory (not the legacy singleton).
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * HTTP error with status code, thrown by apiFetch for non-2xx responses.
 * Use `err instanceof HttpError && err.status === 404` instead of parsing message strings.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Number of retry attempts on network/server errors. Default: 3. */
  retries?: number;
}

/**
 * Authenticated fetch wrapper for FastAPI backend.
 *
 * - Converts camelCase request body keys to snake_case before sending.
 * - Converts snake_case response keys to camelCase before returning.
 * - Retries failed requests with exponential backoff.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { retries = 3, ...fetchOptions } = options;

  const headers = await getAuthHeaders();

  // Convert camelCase body keys to snake_case for the Python backend
  let body = fetchOptions.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      body = JSON.stringify(snakifyKeys(parsed));
    } catch {
      // Not JSON — leave body as-is (e.g. FormData, raw string)
    }
  }

  return withRetry<T>(async () => {
    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      body,
      headers: { ...headers, ...(fetchOptions.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = (errBody as { detail?: string }).detail ?? `API error ${res.status}`;
      throw new HttpError(res.status, message);
    }

    if (res.status === 204) return null as T;
    const json = await res.json();
    return camelizeKeys<T>(json);
  }, retries);
}

/**
 * Fetch a patient's insurance plans from the BFF.
 * Returns raw snake_case response as PatientInsurance[] (no key conversion).
 * Uses getAuthHeaders() directly (not apiFetch) to preserve snake_case keys.
 */
export async function fetchPatientInsurance(patientId: string): Promise<unknown[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/patients/${patientId}/insurance`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch the superbill PDF blob for a given encounter.
 * Returns null if the request fails.
 * Uses getAuthHeaders() directly (not apiFetch) because apiFetch only handles JSON responses.
 */
export async function fetchSuperbillPdfBlob(encounterId: string): Promise<Blob | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`, { headers });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

/**
 * Fetch a payer's fee schedule overrides.
 * Returns a Map of CPT code -> fee for quick lookup.
 * Returns empty map on error or for self-pay.
 */
export async function fetchPayerFeeSchedule(
  payerId: string | null,
): Promise<Map<string, number>> {
  if (!payerId) return new Map();
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/payers/${payerId}/fee-schedule`, { headers });
    if (!res.ok) return new Map();
    const data: Array<{ cpt_code: string; fee: number }> = await res.json();
    const map = new Map<string, number>();
    for (const item of data) {
      map.set(item.cpt_code, item.fee);
    }
    return map;
  } catch {
    return new Map();
  }
}
