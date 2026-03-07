import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ encounterId: string; itemId: string }> }
) {
  const { encounterId, itemId } = await params;
  return proxyToFastAPI(
    request,
    `/api/encounters/${encounterId}/superbill/line-items/${itemId}`
  );
}
