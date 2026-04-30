/**
 * BFF proxy for GET /api/messaging/analytics (Phase 12-05).
 * Single-aggregate response — KPIs + 4 charts in one round-trip
 * (mirrors Phase 8 /api/analytics precedent).
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/analytics/");
}
