// src/types/api.ts
// Miroirs des réponses koulis-api. Format snake_case respecté.

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
  is_published: boolean;
  source: string;
  created_at: string;
  updated_at: string;
};

export type ApiRestaurantWithSlots = ApiRestaurant & {
  available_slots: string[];
};

export type ApiSearchResponse = {
  count: number;
  results: ApiRestaurantWithSlots[];
};

export type ApiAvailabilitySlot = {
  id: string;
  restaurant_id: string;
  slot_at: string;
  capacity_total: number;
  capacity_remaining: number;
};

export type ApiAvailabilitiesResponse = {
  restaurant_id: string;
  restaurant_name: string;
  query: { datetime: string; party_size: number; window_hours: number };
  count: number;
  slots: ApiAvailabilitySlot[];
};

export type ApiHoldResponse = {
  hold_id: string;
  restaurant_id: string;
  restaurant_name: string;
  slot_at: string;
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
  slot_at: string;
  party_size: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  special_requests: string | null;
  created_at: string;
};