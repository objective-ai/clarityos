import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patient_id");
  const qs = patientId ? `?patient_id=${patientId}` : "";
  return proxyToFastAPI(req, `/api/admin/seed-demo/${qs}`);
}
