import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; problemId: string }> }
) {
  const { encounterId, problemId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/diagnoses/from-problem/${problemId}`);
}
