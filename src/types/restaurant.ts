// src/types/restaurant.ts
// Miroir TS du modèle SQLAlchemy `restaurants`.
// Convention : snake_case conservé pour matcher la sérialisation JSON
// (FastAPI/Pydantic par défaut). Datetimes en ISO 8601 string.

export type ActorType = "RESTAURANT" | "COFFEE_SHOP" | "HOTEL" | "BAKERY" | (string & {});

export type PriceRange = 1 | 2 | 3 | 4;

export interface Restaurant {
  // ── Identité ─────────────────────────────────────────────────────────────
  id: string; // UUID
  name: string;
  slug: string | null;

  // ── Localisation ─────────────────────────────────────────────────────────
  address: string | null;
  postal_code: string | null;
  city_name: string | null;
  country_code: string; // ISO 3166-1 alpha-2, défaut "FR"
  latitude: number | null;
  longitude: number | null;

  // ── Infos pratiques ──────────────────────────────────────────────────────
  actor_type: ActorType | null;
  price_range: PriceRange | null;
  phone: string | null;
  website_url: string | null;
  booking_url: string | null;
  google_place_id: string | null;

  // ── Contenu éditorial ────────────────────────────────────────────────────
  description_html: string | null;
  menu_content_html: string | null;
  excerpt: string | null;
  editorial_highlight: string | null;

  // ── Médias ───────────────────────────────────────────────────────────────
  main_photo_url: string | null;
  photos: string[] | null;
  instagram_url: string | null;

  // ── Avis ─────────────────────────────────────────────────────────────────
  rating: number | null;
  reviews_count: number;

  // ── Tags legacy ──────────────────────────────────────────────────────────
  is_cheap: boolean;
  vegan_options: boolean;
  terrasse: boolean;
  kids_friendly: boolean;
  is_buffet: boolean;
  is_instagrammable: boolean;

  // ── Taxonomie v2 — food_tags ─────────────────────────────────────────────
  food_fait_maison: boolean;
  food_bio: boolean;
  food_local: boolean;
  food_saison: boolean;
  food_frais: boolean;
  food_healthy: boolean;
  food_comfort_food: boolean;
  food_gastronomique: boolean;
  food_genereux: boolean;
  food_createur: boolean;
  food_traditionnel: boolean;
  food_patisserie: boolean;
  food_specialty_coffee: boolean;
  food_zero_dechet: boolean;
  // ── Taxonomie v3 — food_tags (extensions) ────────────────────────────────
  food_fumage: boolean;
  food_fermentation: boolean;
  food_nose_to_tail: boolean;
  food_seafood: boolean;

  // ── Taxonomie v2 — format_tags ───────────────────────────────────────────
  format_buffet: boolean;
  format_a_la_carte: boolean;
  format_formule: boolean;
  format_a_composer: boolean;
  format_all_day: boolean;
  format_dominical: boolean;
  format_a_theme: boolean;
  format_show_cooking: boolean;
  // ── Taxonomie v3 — format_tags (extensions) ──────────────────────────────
  format_menu_degustation: boolean;
  format_menu_du_jour: boolean;
  format_brunch: boolean;
  format_afterwork: boolean;
  format_privatisation: boolean;
  format_traiteur: boolean;

  // ── Taxonomie v2 — cuisine_tags ──────────────────────────────────────────
  cuisine_americaine: boolean;
  cuisine_italienne: boolean;
  cuisine_mediterraneenne: boolean;
  cuisine_orientale: boolean;
  cuisine_asiatique: boolean;
  cuisine_latino: boolean;
  cuisine_brasserie: boolean;
  cuisine_street_food: boolean;
  cuisine_halal: boolean;
  // ── Taxonomie v3 — cuisine_tags (extensions) ─────────────────────────────
  cuisine_francaise: boolean;
  cuisine_japonaise: boolean;
  cuisine_indienne: boolean;
  cuisine_thailandaise: boolean;
  cuisine_coreenne: boolean;
  cuisine_africaine: boolean;
  cuisine_libanaise: boolean;
  cuisine_mexicaine: boolean;
  cuisine_peruvienne: boolean;
  cuisine_vietnamienne: boolean;
  cuisine_chinoise: boolean;
  cuisine_grecque: boolean;
  cuisine_espagnole: boolean;
  cuisine_portugaise: boolean;
  cuisine_turque: boolean;
  cuisine_fusion: boolean;

  // ── Taxonomie v2 — dietary_options ───────────────────────────────────────
  diet_vegan: boolean;
  diet_vegetarian: boolean;
  diet_gluten_free: boolean;
  diet_lactose_free: boolean;
  diet_flexitarien: boolean;
  // ── Taxonomie v3 — dietary_options (extensions) ──────────────────────────
  diet_casher: boolean;
  diet_pescetarien: boolean;

  // ── Taxonomie v2 — atmosphere_tags ───────────────────────────────────────
  atmo_cosy: boolean;
  atmo_instagrammable: boolean;
  atmo_family_friendly: boolean;
  atmo_quiet: boolean;
  atmo_trendy: boolean;
  atmo_student_friendly: boolean;
  // ── Taxonomie v3 — atmosphere_tags (extensions) ──────────────────────────
  atmo_romantique: boolean;
  atmo_business: boolean;
  atmo_rooftop: boolean;

  // ── Taxonomie v2 — services ──────────────────────────────────────────────
  svc_terrace: boolean;
  svc_wifi: boolean;
  svc_reservation: boolean;
  svc_takeaway: boolean;
  svc_dog_friendly: boolean;
  svc_baby_friendly: boolean;
  venue_salon_de_the: boolean;
  // ── Taxonomie v3 — services (extensions) ─────────────────────────────────
  svc_delivery: boolean;
  svc_parking: boolean;
  svc_private_dining: boolean;
  svc_events: boolean;
  svc_accessible_pmr: boolean;

  // ── Taxonomie — overflow ─────────────────────────────────────────────────
  food_tags_overflow: string[];

  // ── Horaires page publique ───────────────────────────────────────────────
  display_hours: Record<string, unknown> | null;

  // ── Timestamps ───────────────────────────────────────────────────────────
  updated_at: string; // ISO 8601
}
