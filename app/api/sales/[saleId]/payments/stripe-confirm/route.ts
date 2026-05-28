import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  const { saleId } = await params;
  return proxyToFastAPI(request, `/api/sales/${saleId}/payments/stripe-confirm/`);
}
