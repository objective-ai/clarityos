import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

// Phase 14 OPT14-07 — AI Scribe optical suggestions for an order.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  return proxyToFastAPI(
    request,
    `/api/optical-orders/${orderId}/suggestions/`,
  );
}
