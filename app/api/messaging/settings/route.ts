/**
 * BFF proxy for /api/messaging/settings (Phase 12-05).
 * GET: read tenant.settings_jsonb.messaging. PATCH: update + emit MESSAGING_ENABLED/DISABLED.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/settings/");
}

export async function PATCH(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/settings/");
}
