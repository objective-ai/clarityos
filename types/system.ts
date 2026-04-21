/**
 * types/system.ts
 *
 * Shared TypeScript types for System Status (Phase 10.3).
 *
 * Consumed by:
 *   - BFF routes in app/api/system/* (server-side)
 *   - Admin System Status page (Plan 10.3-06)
 *
 * These are the canonical camelCase shapes returned to the browser — the
 * FastAPI snake_case schemas in backend/schemas/{system,uptime}.py are
 * mapped to these keys at the BFF boundary.
 */

export interface DependencyStatus {
  status: "ok" | "degraded" | "down";
  latencyMs: number;
}

export interface HealthResponse {
  api: "ok";
  postgres: DependencyStatus;
  supabaseAuth: DependencyStatus;
  version: string;
  checkedAt: string; // ISO 8601 UTC with 'Z' suffix
}

export interface UptimeSummary {
  uptimePct: number;
  samplesTotal: number;
  samplesGreen: number;
  windowStart: string | null; // ISO UTC or null when no samples
  windowEnd: string | null;
}

export interface ErrorIssue {
  id: string;
  title: string;
  count: number;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  permalink: string;
  environment?: string;
  level?: string;
  culprit?: string;
  tags?: Array<{ key: string; value: string }>;
}

export interface ErrorIssueList {
  issues: ErrorIssue[];
  fetchedAt: string; // ISO UTC when the BFF fetched (or served cache)
  cached: boolean;
}
