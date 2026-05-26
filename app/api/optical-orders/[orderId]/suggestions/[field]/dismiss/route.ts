import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

// Phase 14 OPT14-07 — dismiss an AI Scribe optical suggestion.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; field: string }> },
) {
  const { orderId, field } = await params;
  return proxyToFastAPI(
    request,
    `/api/optical-orders/${orderId}/suggestions/${field}/dismiss/`,
  );
}
