import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; colIndex: string }> }
) {
  const { encounterId, colIndex } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/column/${colIndex}`);
}
