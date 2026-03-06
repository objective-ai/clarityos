/**
 * BFF proxy: POST /api/patients/:id/prep-me (AI clinical summary)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { patientId } = await params;

  const res = await fetch(`${FASTAPI_URL}/api/patients/${patientId}/prep-me`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000), // AI calls can be slow
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
