/**
 * Stripe webhook BFF passthrough (Plan 15-08, POS-02).
 *
 * Forwards the RAW body bytes — NEVER parses JSON before FastAPI verifies the
 * Stripe-Signature (Pitfall 1). Stripe signs over the raw request body; any
 * re-serialization would invalidate the signature.
 *
 * Adds X-Webhook-Internal HMAC seal so a direct hit to FastAPI bypassing
 * Vercel is rejected (defense-in-depth, matches Twilio/Postmark webhooks).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // raw body needed
export const dynamic = "force-dynamic"; // no caching

export async function POST(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";
  const internal = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!internal) {
    return new NextResponse("server misconfigured", { status: 500 });
  }

  const sig = request.headers.get("Stripe-Signature") ?? "";
  const body = await request.text();

  const upstream = await fetch(`${FASTAPI_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type":
        request.headers.get("Content-Type") ?? "application/json",
      "Stripe-Signature": sig,
      "X-Webhook-Internal": internal,
    },
    body,
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
