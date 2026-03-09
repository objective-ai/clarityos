import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/address/place-details?placeRef=places/XXXX
 *
 * Fetches structured address components from Google Places (New) API.
 * Parses adrFormatAddress HTML to extract street, city, state, zip.
 * Requires authenticated session.
 */
export async function GET(req: NextRequest) {
  // Auth gate — prevent unauthenticated abuse of paid Google API
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ address: null, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ address: null, error: "Not configured" });
  }

  const placeRef = req.nextUrl.searchParams.get("placeRef");
  if (!placeRef) {
    return NextResponse.json({ address: null, error: "placeRef required" });
  }

  try {
    const res = await fetch(`https://places.googleapis.com/v1/${placeRef}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "adrFormatAddress,formattedAddress,addressComponents",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error("Google Places details error:", res.status, await res.text());
      return NextResponse.json({ address: null, error: "Place details request failed" });
    }

    const data = await res.json();

    // Parse the adrFormatAddress HTML spans
    const extract = (cls: string): string => {
      const match = data.adrFormatAddress?.match(
        new RegExp(`<span class="${cls}">([^<]+)</span>`)
      );
      return match ? match[1] : "";
    };

    const address = {
      addressLine1: extract("street-address"),
      city: extract("locality"),
      state: extract("region"),
      zipCode: extract("postal-code"),
      formatted: data.formattedAddress || "",
    };

    return NextResponse.json({ address });
  } catch (err) {
    console.error("Google Places details error:", err);
    return NextResponse.json({ address: null, error: "Place details request failed" });
  }
}
