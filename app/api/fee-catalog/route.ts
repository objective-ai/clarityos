import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/fee-catalog/");
}

export async function PUT(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/fee-catalog/");
}
