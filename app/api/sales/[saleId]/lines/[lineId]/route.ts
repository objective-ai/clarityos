import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string; lineId: string }> },
) {
  const { saleId, lineId } = await params;
  return proxyToFastAPI(request, `/api/sales/${saleId}/lines/${lineId}/`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string; lineId: string }> },
) {
  const { saleId, lineId } = await params;
  return proxyToFastAPI(request, `/api/sales/${saleId}/lines/${lineId}/`);
}
