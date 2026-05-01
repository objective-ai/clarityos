/**
 * BFF proxy for POST /api/messaging/onboarding/activate (Plan 12-10).
 * Flips tenant.settings_jsonb.messaging.messaging_enabled = true. OWNER only.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/onboarding/activate/");
}
