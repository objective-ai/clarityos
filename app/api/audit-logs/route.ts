import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

/**
 * GET /api/audit-logs
 *
 * BFF proxy that forwards authenticated requests to the FastAPI audit-logs
 * endpoint. Validates the user via Supabase getUser() (server-side
 * revalidation) before proxying.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // CRITICAL: Use getUser() not getSession() -- server-side must revalidate
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get session for the access_token to forward to FastAPI
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "No active session" },
        { status: 401 }
      );
    }

    // Forward search params to upstream FastAPI
    const searchParams = request.nextUrl.searchParams.toString();
    const upstreamUrl = searchParams
      ? `${FASTAPI_URL}/api/audit-logs?${searchParams}`
      : `${FASTAPI_URL}/api/audit-logs`;

    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      return NextResponse.json(
        { error: errorBody },
        { status: upstreamResponse.status }
      );
    }

    const data = await upstreamResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Gateway Timeout" },
        { status: 504 }
      );
    }

    console.error("[audit-logs] BFF proxy error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
