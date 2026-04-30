/**
 * BFF proxy for POST /api/messaging/recall-queue/send-all (Phase 12-05).
 * Dispatches a recall batch and increments per-patient touch counts.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/recall-queue/send-all/");
}
