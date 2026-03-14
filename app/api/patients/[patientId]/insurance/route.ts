import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/insurance/`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const { patientId } = await params;
  return proxyToFastAPI(request, `/api/patients/${patientId}/insurance/`);
}
