import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, `/api/appointments/`);
}

export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, `/api/appointments/`);
}
