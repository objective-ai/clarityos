/**
 * BFF proxy for GET /api/messaging/history/{patientId} (Phase 12-05).
 * Per-patient message history, newest first.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  req: NextRequest,
  { params }: { params: { patientId: string } },
) {
  return proxyToFastAPI(req, `/api/messaging/history/${params.patientId}/`);
}
