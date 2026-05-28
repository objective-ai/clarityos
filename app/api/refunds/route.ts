import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, "/api/refunds/", { forwardQuery: true });
}
