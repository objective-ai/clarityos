import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  const { encounterId } = await params;
  return proxyToFastAPI(request, `/api/optical/${encounterId}/status`);
}
