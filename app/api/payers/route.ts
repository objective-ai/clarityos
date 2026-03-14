import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}

export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
