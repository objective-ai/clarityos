import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/analytics/");
}
