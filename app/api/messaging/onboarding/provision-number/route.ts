/**
 * BFF proxy for POST /api/messaging/onboarding/provision-number (Plan 12-10).
 * Provisions a Twilio local number in the requested area code.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/onboarding/provision-number/");
}
