import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

/**
 * GET /api/appointments?date=YYYY-MM-DD&provider_id=UUID
 *
 * BFF proxy for listing appointments by date.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams.toString();
    const upstreamUrl = `${FASTAPI_URL}/api/appointments?${searchParams}`;

    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[appointments] BFF proxy error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/appointments
 *
 * BFF proxy for creating an appointment.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }

    const body = await request.text();

    const res = await fetch(`${FASTAPI_URL}/api/appointments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    return NextResponse.json(await res.json(), { status: 201 });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[appointments] BFF proxy error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
