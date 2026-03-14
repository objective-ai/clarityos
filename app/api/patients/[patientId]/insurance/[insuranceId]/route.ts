import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string; insuranceId: string }> },
) {
  const { patientId, insuranceId } = await params;
  return proxyToFastAPI(
    request,
    `/api/patients/${patientId}/insurance/${insuranceId}/`,
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string; insuranceId: string }> },
) {
  const { patientId, insuranceId } = await params;
  return proxyToFastAPI(
    request,
    `/api/patients/${patientId}/insurance/${insuranceId}/`,
  );
}
