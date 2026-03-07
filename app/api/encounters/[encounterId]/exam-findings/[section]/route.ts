import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; section: string }> }
) {
  const { encounterId, section } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/exam-findings/${section}`);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string; section: string }> }
) {
  const { encounterId, section } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/exam-findings/${section}`);
}
