import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const { saleId } = await params;
  return proxyToFastAPI(request, `/api/sales/${saleId}/refunds/`);
}
