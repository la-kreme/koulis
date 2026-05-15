// src/types/api.ts
// Miroirs des réponses koulis-api. Format snake_case respecté.

// A moment-in-time, pre-localized to the restaurant's IANA timezone
// by the Koulis API. The whole point of this object is to free
// MCP clients (and the LLMs they serve) from doing any timezone
// conversion themselves — which is error-prone and depends on the
// process locale.
export type LocalizedDateTime = {
  iso_utc: string;           // "2026-05-14T19:00:00.000Z" — use for inter-service calls
  local_date: string;        // "2026-05-14"
  local_time: string;        // "21:00"
  local_datetime: string;    // "2026-05-14T21:00:00+02:00"
  timezone: string;          // "Europe/Paris"
  human_readable_fr: string; // "jeudi 14 mai à 21h00" — USE FOR DISPLAY (French)
  human_readable_en: string; // "Thursday, May 14 at 9:00 PM" — USE FOR DISPLAY (English)
};

export type ApiRestaurant = {
  id: string;
  name: string;
  slug: string | null;
  address: string | null;
  postal_code: string | null;
  city_name: string | null;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  actor_type: string | null;
  price_range: number | null;
  excerpt: string | null;
  rating: number | null;
  reviews_count: number;
  cuisines: string[];
  formats: string[];
  dietary: string[];
  atmosphere: string[];
  services: string[];
  timezone: string;          // ← AJOUT : IANA timezone of the restaurant
  is_published: boolean;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ApiRestaurantWithSlots = ApiRestaurant & {
  available_slots: LocalizedDateTime[];   // ← was string[]
};

export type ApiSearchResponse = {
  count: number;
  results: ApiRestaurantWithSlots[];
};

export type ApiAvailabilitySlot = {
  id: string;
  restaurant_id: string;
  slot: LocalizedDateTime;   // ← was slot_at: string
  capacity_total: number;
  capacity_remaining: number;
};

export type ApiAvailabilitiesResponse = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_timezone: string;   // ← AJOUT
  query: { datetime: string; party_size: number; window_hours: number };
  count: number;
  slots: ApiAvailabilitySlot[];
};

export type ApiHoldResponse = {
  hold_id: string;
  restaurant_id: string;
  restaurant_name: string;
  slot: LocalizedDateTime;   // ← was slot_at: string
  party_size: number;
  expires_at: string;
  expires_in_seconds: number;
};

export type ApiReservationResponse = {
  status: "confirmed";
  idempotent_replay: boolean;
  confirmation_id: string;
  restaurant_id: string;
  restaurant_name: string;
  slot: LocalizedDateTime;   // ← was slot_at: string
  party_size: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  special_requests: string | null;
  created_at: string;
};