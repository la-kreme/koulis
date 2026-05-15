import type { LocalizedDateTime } from "../types/api.js";
import type {
  ApiSearchResponse,
  ApiAvailabilitiesResponse,
  ApiHoldResponse,
  ApiReservationResponse,
  ApiRestaurantWithSlots,
} from "../types/api.js";

export const SLOT: LocalizedDateTime = {
  iso_utc: "2026-05-14T19:00:00.000Z",
  local_date: "2026-05-14",
  local_time: "21:00",
  local_datetime: "2026-05-14T21:00:00+02:00",
  timezone: "Europe/Paris",
  human_readable_fr: "jeudi 14 mai à 21h00",
  human_readable_en: "Thursday, May 14 at 9:00 PM",
};

export const RESTAURANT: ApiRestaurantWithSlots = {
  id: "rest-001",
  name: "Le Petit Brunch",
  slug: "le-petit-brunch",
  address: "12 rue de la Paix",
  postal_code: "75002",
  city_name: "Paris",
  country_code: "FR",
  latitude: 48.8698,
  longitude: 2.3311,
  phone: "+33123456789",
  actor_type: "RESTAURANT",
  price_range: 2,
  excerpt: "A cozy Parisian brunch spot",
  rating: 4.5,
  reviews_count: 120,
  cuisines: ["française"],
  formats: ["brunch"],
  dietary: ["vegan"],
  atmosphere: ["cosy"],
  services: ["terrasse"],
  timezone: "Europe/Paris",
  is_published: true,
  source: "koulis",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  available_slots: [SLOT],
};

export const SEARCH_RESPONSE: ApiSearchResponse = {
  count: 1,
  results: [RESTAURANT],
};

export const AVAILABILITIES_RESPONSE: ApiAvailabilitiesResponse = {
  restaurant_id: "rest-001",
  restaurant_name: "Le Petit Brunch",
  restaurant_timezone: "Europe/Paris",
  query: { datetime: "2026-05-14T19:00:00Z", party_size: 2, window_hours: 2 },
  count: 1,
  slots: [
    {
      id: "slot-001",
      restaurant_id: "rest-001",
      slot: SLOT,
      capacity_total: 40,
      capacity_remaining: 12,
    },
  ],
};

export const HOLD_RESPONSE: ApiHoldResponse = {
  hold_id: "hold-abc",
  restaurant_id: "rest-001",
  restaurant_name: "Le Petit Brunch",
  slot: SLOT,
  party_size: 2,
  expires_at: "2026-05-14T19:05:00.000Z",
  expires_in_seconds: 300,
};

export const RESERVATION_RESPONSE: ApiReservationResponse = {
  status: "confirmed",
  idempotent_replay: false,
  confirmation_id: "CONF-XYZ",
  restaurant_id: "rest-001",
  restaurant_name: "Le Petit Brunch",
  slot: SLOT,
  party_size: 2,
  customer_name: "Jean Dupont",
  customer_phone: "+33612345678",
  customer_email: "jean@example.com",
  special_requests: null,
  created_at: "2026-05-14T18:55:00Z",
};
