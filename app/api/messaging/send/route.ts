/**
 * BFF proxy for POST /api/messaging/send (Phase 12-05).
 * Single-message dispatch via the FastAPI sender choke point.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/send/");
}
