/**
 * lib/bff.ts
 *
 * Shared BFF (Backend-for-Frontend) proxy utility.
 * Handles Supabase auth, request forwarding to FastAPI, timeout, and errors.
 *
 * Usage in a route handler:
 *   import { proxyToFastAPI } from "@/lib/bff";
 *   export async function POST(req, { params }) {
 *     return proxyToFastAPI(req, `/api/appointments/${params.appointmentId}/check-in`);
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

interface ProxyOptions {
  /** Override HTTP method (defaults to incoming request method) */
  method?: string;
  /** Forward request body. Default: true for POST/PATCH/PUT, false otherwise */
  forwardBody?: boolean;
  /** Forward query string from the incoming request. Default: true for GET */
  forwardQuery?: boolean;
  /** Timeout in ms. Default: 10000 */
  timeout?: number;
}

/**
 * Authenticate via Supabase, then proxy the request to FastAPI.
 *
 * @param request  - The incoming Next.js request
 * @param backendPath - The FastAPI path, e.g. `/api/appointments/123/check-in`
 * @param options  - Override method, body forwarding, timeout
 */
export async function proxyToFastAPI(
  request: NextRequest,
  backendPath: string,
  options: ProxyOptions = {}
): Promise<NextResponse> {
  // 1. Auth — validate user + session
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

  // 2. Build upstream URL
  const method = options.method ?? request.method;
  const shouldForwardQuery =
    options.forwardQuery ?? method === "GET";
  const shouldForwardBody =
    options.forwardBody ?? ["POST", "PATCH", "PUT"].includes(method);

  let url = `${FASTAPI_URL}${backendPath}`;
  if (shouldForwardQuery) {
    const qs = request.nextUrl.searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  // 3. Forward request
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: shouldForwardBody ? await request.text() : undefined,
      signal: AbortSignal.timeout(options.timeout ?? 10_000),
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Empty response" }, {
      status: res.status,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Gateway Timeout" }, { status: 504 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[BFF] ${method} ${backendPath}:`, msg);
    return NextResponse.json(
      { detail: "Internal server error", debug: msg },
      { status: 500 }
    );
  }
}
