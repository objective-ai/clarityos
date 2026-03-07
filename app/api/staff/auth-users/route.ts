import { NextRequest, NextResponse } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      { detail: "email parameter required" },
      { status: 400 }
    );
  }

  return proxyToFastAPI(request, `/api/staff/auth-users`);
}
