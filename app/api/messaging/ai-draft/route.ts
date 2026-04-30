/**
 * BFF proxy for POST /api/messaging/ai-draft (Phase 12-05).
 * Returns a HIPAA-safe message body drafted by Claude.
 * Pre-flights opt-out (CRM-12 contract) — never invokes Claude when
 * the patient cannot legally receive on the chosen channel/purpose.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/ai-draft/");
}
