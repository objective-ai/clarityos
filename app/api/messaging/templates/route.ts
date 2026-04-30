/**
 * BFF proxy for /api/messaging/templates (Phase 12-05).
 * GET: list tenant templates. POST: create new template.
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/templates/");
}

export async function POST(req: NextRequest) {
  return proxyToFastAPI(req, "/api/messaging/templates/");
}
