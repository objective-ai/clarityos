/**
 * BFF proxy for POST /api/messaging/onboarding/test-send (Plan 12-10).
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/onboarding/test-send/");
}
