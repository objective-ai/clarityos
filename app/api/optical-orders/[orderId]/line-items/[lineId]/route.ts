import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; lineId: string }> },
) {
  const { orderId, lineId } = await params;
  return proxyToFastAPI(
    request,
    `/api/optical-orders/${orderId}/line-items/${lineId}/`,
  );
}
