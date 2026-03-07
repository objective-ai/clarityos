import { NextRequest, NextResponse } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;

  // Sub-resource routing: ?sub=encounters or ?sub=flowsheet
  const subResource = request.nextUrl.searchParams.get("sub");
  let path = `/api/patients/${patientId}`;
  if (subResource === "encounters") {
    path = `/api/patients/${patientId}/encounters`;
  } else if (subResource === "flowsheet") {
    path = `/api/patients/${patientId}/flowsheet`;
  }

  return proxyToFastAPI(request, path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}`);
}
