import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

/**
 * POST /api/ai-scribe/accept
 *
 * BFF proxy that forwards authenticated AI Scribe accept requests to FastAPI.
 * Validates the user via Supabase getUser() before proxying.
 *
 * Expected request body: { encounterId: string }
 */
export async function POST(request: NextRequest) {
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

    // Parse request body for the encounter ID
    const body = await request.json();
    const { encounterId } = body;

    if (!encounterId) {
      return NextResponse.json(
        { error: "encounterId is required" },
        { status: 400 }
      );
    }

    // Proxy to FastAPI ai-scribe accept endpoint
    const upstreamUrl = `${FASTAPI_URL}/api/encounters/${encounterId}/ai-scribe/accept`;

    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

    console.error("[ai-scribe/accept] BFF proxy error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
