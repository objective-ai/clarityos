/**
 * BFF proxy for /api/messaging/preferences/{patientId} (Phase 12-05).
 * GET: read per-patient channel + consent state.
 * PATCH: update consent flags + emit CHANNEL_PREFERENCE_UPDATED + CONSENT_GRANTED/REVOKED.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  req: NextRequest,
  { params }: { params: { patientId: string } },
) {
  return proxyToFastAPI(req, `/api/messaging/preferences/${params.patientId}/`);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { patientId: string } },
) {
  return proxyToFastAPI(req, `/api/messaging/preferences/${params.patientId}/`);
}
