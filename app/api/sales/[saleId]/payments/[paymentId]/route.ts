import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string; paymentId: string }> },
) {
  const { saleId, paymentId } = await params;
  return proxyToFastAPI(request, `/api/sales/${saleId}/payments/${paymentId}/`);
}
