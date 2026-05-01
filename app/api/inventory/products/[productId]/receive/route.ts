import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return proxyToFastAPI(request, `/api/inventory/products/${productId}/receive/`);
}
