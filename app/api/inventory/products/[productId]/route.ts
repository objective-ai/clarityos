import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return proxyToFastAPI(request, `/api/inventory/products/${productId}/`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return proxyToFastAPI(request, `/api/inventory/products/${productId}/`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return proxyToFastAPI(request, `/api/inventory/products/${productId}/`);
}
