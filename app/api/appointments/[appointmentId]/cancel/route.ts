import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

/**
 * POST /api/appointments/[appointmentId]/cancel
 *
 * Cancels an appointment with a required reason.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
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

    const { appointmentId } = await params;
    const body = await request.text();

    const res = await fetch(
      `${FASTAPI_URL}/api/appointments/${appointmentId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({ error: errorBody }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    console.error("[appointments/cancel] BFF error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
