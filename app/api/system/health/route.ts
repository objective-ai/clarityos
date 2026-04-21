/**
 * app/api/system/health/route.ts
 *
 * BFF proxy for GET /api/system/health (Phase 10.3-04).
 *
 * Upstream FastAPI route lives at /api/system/health/ (trailing slash
 * required per lib/bff.ts rule). Backend writes one row to
 * public.system_health_samples per call, which feeds the uptime
 * endpoint (10.3-05) and the System Status admin page (10.3-06).
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/system/health/");
}
