import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  const { refundId } = await params;
  return proxyToFastAPI(request, `/api/refunds/${refundId}/`);
}
