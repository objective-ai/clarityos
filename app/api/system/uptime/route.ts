/**
 * app/api/system/uptime/route.ts
 *
 * BFF proxy for GET /api/system/uptime — forwards to FastAPI
 * /api/system/uptime/ (trailing slash required per project BFF rules).
 *
 * Consumed by the System Status admin page (Plan 10.3-06).
 */

import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/system/uptime/");
}
