import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/admin/payment-config/");
}

export async function PUT(request: NextRequest) {
  return proxyToFastAPI(request, "/api/admin/payment-config/");
}
