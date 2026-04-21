/**
 * app/api/system/errors/route.ts
 *
 * BFF proxy for the Sentry REST Issues API.
 *
 * Design rules:
 *   1. SENTRY_API_TOKEN is server-side only — it MUST NEVER be forwarded
 *      to the browser. We never echo the Authorization header in the
 *      response body or leak it via error messages.
 *   2. 20-second in-memory cache to avoid rate-limit fan-out when multiple
 *      admin tabs poll simultaneously.
 *   3. OWNER-gate: only users with role="OWNER" can hit this route. Non-
 *      OWNER requests get 403 without any Sentry round-trip.
 *   4. On Sentry 4xx/5xx we return 200 with an empty issue list plus a
 *      `x-sentry-upstream-status` header so the UI can show a soft warning
 *      without breaking the rest of the System Status page.
 *
 * Consumed by the Recent Errors panel on the System Status admin page
 * (Plan 10.3-06).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ErrorIssueList } from "@/types/system";

// Module-level cache — one slot. Reset on cold start.
let cache: { at: number; payload: ErrorIssueList } | null = null;
const TTL_MS = 20_000;

// Exported for tests so they can reset the cache between cases.
export function __resetCache() {
  cache = null;
}

interface SupabaseUserLike {
  app_metadata?: { role?: string } | null;
  role?: string;
}

function extractRole(user: SupabaseUserLike | null | undefined): string | null {
  if (!user) return null;
  return user.app_metadata?.role ?? user.role ?? null;
}

export async function GET(_req: NextRequest) {
  // ── OWNER gate ─────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = extractRole(user as SupabaseUserLike | null);
  if (!user || role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // ── Cache hit ──────────────────────────────────────────────────────────
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json({ ...cache.payload, cached: true });
  }

  // ── Env check — graceful empty payload if Sentry isn't configured ─────
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const token = process.env.SENTRY_API_TOKEN;
  if (!org || !project || !token) {
    const payload: ErrorIssueList = {
      issues: [],
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "x-sentry-upstream-status": "not-configured" },
    });
  }

  // ── Fetch upstream ────────────────────────────────────────────────────
  const url =
    `https://sentry.io/api/0/projects/${org}/${project}/issues/` +
    `?query=is:unresolved&limit=50&environment=production`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    const payload: ErrorIssueList = {
      issues: [],
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "x-sentry-upstream-status": "network-error" },
    });
  }

  if (!res.ok) {
    const payload: ErrorIssueList = {
      issues: [],
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "x-sentry-upstream-status": String(res.status) },
    });
  }

  // Normalize Sentry payload — Sentry already uses camelCase for the fields
  // we care about, but we defensively coerce types and strip unexpected
  // keys so the BFF response shape is predictable.
  const raw = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  const issues = Array.isArray(raw)
    ? raw.map((i) => ({
        id: String(i.id ?? ""),
        title: String(i.title ?? ""),
        count: Number(i.count ?? 0),
        userCount: Number(i.userCount ?? 0),
        lastSeen: String(i.lastSeen ?? ""),
        firstSeen: String(i.firstSeen ?? ""),
        permalink: String(i.permalink ?? ""),
        environment:
          typeof i.environment === "string" ? i.environment : undefined,
        level: typeof i.level === "string" ? i.level : undefined,
        culprit: typeof i.culprit === "string" ? i.culprit : undefined,
      }))
    : [];

  const payload: ErrorIssueList = {
    issues,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
  cache = { at: now, payload };
  return NextResponse.json(payload);
}
