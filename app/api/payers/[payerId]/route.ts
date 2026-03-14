import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { payerId: string } },
) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { payerId: string } },
) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { payerId: string } },
) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
