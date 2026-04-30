/**
 * BFF proxy for GET /api/messaging/recall-queue (Phase 12-05).
 * Returns live recall candidates (12mo + no future appt + not exhausted).
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/recall-queue/");
}
