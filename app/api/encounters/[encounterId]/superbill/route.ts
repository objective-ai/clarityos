import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  const { encounterId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/superbill/`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  const { encounterId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/superbill/`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  const { encounterId } = await params;
  return proxyToFastAPI(request, `/api/encounters/${encounterId}/superbill/`);
}
