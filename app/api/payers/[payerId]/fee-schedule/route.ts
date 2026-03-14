import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { payerId: string } },
) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/fee-schedule/`);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { payerId: string } },
) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/fee-schedule/`);
}
