/**
 * BFF proxy for GET /api/messaging/inbox (Phase 12-05).
 * Inbound SMS feed, newest first; supports `filter_classification` query.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/inbox/");
}
