/**
 * types/booking.ts
 *
 * TypeScript types for the public booking API.
 * Mirrors backend/schemas/public_booking.py response shapes.
 */

// ---- GET /{slug}/info/ ----

export interface BookableType {
  value: string;
  label: string;
  duration_minutes: number;
}

export interface BookingProvider {
  id: string;
  first_name: string;
  last_name: string;
}

export interface BookingClinicInfo {
  clinic_name: string;
  timezone: string;
  bookable_types: BookableType[];
  providers: BookingProvider[];
}

// ---- GET /{slug}/availability/ ----

export interface AvailabilityResponse {
  date: string;
  provider_id: string;
  provider_name: string;
  slots: string[]; // ISO 8601 datetime strings
  timezone: string;
}

// ---- POST /{slug}/book/ ----

export interface PublicBookingRequest {
  first_name: string;
  last_name: string;
  dob: string; // YYYY-MM-DD
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  phone?: string;
  email?: string;
  provider_id: string;
  appointment_type: string;
  start_time: string; // ISO 8601
  chief_complaint?: string;
}

export interface PublicBookingResponse {
  success: boolean;
  appointment_id: string;
  appointment_date: string; // human-readable
  provider_name: string;
  appointment_type_label: string;
  intake_url: string | null;
  message: string;
}
