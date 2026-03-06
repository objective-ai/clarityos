import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

async function getAuthHeaders() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

/**
 * GET /api/appointments/[appointmentId]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentId } = await params;
    const res = await fetch(`${FASTAPI_URL}/api/appointments/${appointmentId}`, {
      method: "GET",
      headers,
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
    console.error("[appointments/id] BFF error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/appointments/[appointmentId]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const headers = await getAuthHeaders();
    if (!headers) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentId } = await params;
    const body = await request.text();

    const res = await fetch(`${FASTAPI_URL}/api/appointments/${appointmentId}`, {
      method: "PATCH",
      headers,
      body,
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
    console.error("[appointments/id] BFF error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
