import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  return proxyToFastAPI(request, `/api/appointments/${appointmentId}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  return proxyToFastAPI(request, `/api/appointments/${appointmentId}`);
}
