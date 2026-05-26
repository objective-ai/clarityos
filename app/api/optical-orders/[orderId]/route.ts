import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  return proxyToFastAPI(request, `/api/optical-orders/${orderId}/`);
}

// Phase 14 OPT14-12 — configurator autosave PATCH.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  return proxyToFastAPI(request, `/api/optical-orders/${orderId}/`);
}
