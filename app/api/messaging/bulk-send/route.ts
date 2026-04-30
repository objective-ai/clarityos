/**
 * BFF proxy for POST /api/messaging/bulk-send (Phase 12-05).
 * 50-recipient cap + 1 msg/sec throttle is enforced server-side.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/bulk-send/");
}
