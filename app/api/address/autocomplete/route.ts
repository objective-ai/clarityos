import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/address/autocomplete?input=...
 *
 * Proxies to Google Places Autocomplete (New) API.
 * Keeps the API key server-side only. Requires authenticated session.
 */
export async function GET(req: NextRequest) {
  // Auth gate — prevent unauthenticated abuse of paid Google API
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ suggestions: [], error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ suggestions: [], error: "Address autocomplete not configured" });
  }

  const input = req.nextUrl.searchParams.get("input")?.trim();
  if (!input || input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        includedPrimaryTypes: ["street_address", "subpremise", "route", "street_number"],
        includedRegionCodes: ["US"],
      }),
    });

    if (!res.ok) {
      console.error("Google Places autocomplete error:", res.status, await res.text());
      return NextResponse.json({ suggestions: [], error: "Autocomplete request failed" });
    }

    const data = await res.json();
    const suggestions = (data.suggestions || []).map(
      (s: { placePrediction: { placeId: string; place: string; text: { text: string } } }) => ({
        placeId: s.placePrediction.placeId,
        placeRef: s.placePrediction.place,
        description: s.placePrediction.text.text,
      })
    );

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Google Places autocomplete error:", err);
    return NextResponse.json({ suggestions: [], error: "Autocomplete request failed" });
  }
}
