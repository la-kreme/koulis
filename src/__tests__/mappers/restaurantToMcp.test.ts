import { describe, it, expect } from "vitest";
import { toMcpSummary } from "../../mappers/restaurantToMcp.js";
import type { Restaurant } from "../../types/restaurant.js";

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  const base: Restaurant = {
    id: "rest-001",
    name: "Test Restaurant",
    slug: "test-restaurant",
    address: "1 rue Test",
    postal_code: "75001",
    city_name: "Paris",
    country_code: "FR",
    latitude: 48.86,
    longitude: 2.33,
    actor_type: "RESTAURANT",
    price_range: 2,
    phone: null,
    website_url: null,
    booking_url: null,
    google_place_id: null,
    description_html: null,
    menu_content_html: null,
    excerpt: "A test restaurant",
    editorial_highlight: null,
    main_photo_url: null,
    photos: null,
    instagram_url: null,
    rating: 4.2,
    reviews_count: 50,
    is_cheap: false,
    vegan_options: false,
    terrasse: false,
    kids_friendly: false,
    is_buffet: false,
    is_instagrammable: false,
    food_fait_maison: false,
    food_bio: false,
    food_local: false,
    food_saison: false,
    food_frais: false,
    food_healthy: false,
    food_comfort_food: false,
    food_gastronomique: false,
    food_genereux: false,
    food_createur: false,
    food_traditionnel: false,
    food_patisserie: false,
    food_specialty_coffee: false,
    food_zero_dechet: false,
    food_fumage: false,
    food_fermentation: false,
    food_nose_to_tail: false,
    food_seafood: false,
    format_buffet: false,
    format_a_la_carte: false,
    format_formule: false,
    format_a_composer: false,
    format_all_day: false,
    format_dominical: false,
    format_a_theme: false,
    format_show_cooking: false,
    format_menu_degustation: false,
    format_menu_du_jour: false,
    format_brunch: false,
    format_afterwork: false,
    format_privatisation: false,
    format_traiteur: false,
    cuisine_americaine: false,
    cuisine_italienne: false,
    cuisine_mediterraneenne: false,
    cuisine_orientale: false,
    cuisine_asiatique: false,
    cuisine_latino: false,
    cuisine_brasserie: false,
    cuisine_street_food: false,
    cuisine_halal: false,
    cuisine_francaise: false,
    cuisine_japonaise: false,
    cuisine_indienne: false,
    cuisine_thailandaise: false,
    cuisine_coreenne: false,
    cuisine_africaine: false,
    cuisine_libanaise: false,
    cuisine_mexicaine: false,
    cuisine_peruvienne: false,
    cuisine_vietnamienne: false,
    cuisine_chinoise: false,
    cuisine_grecque: false,
    cuisine_espagnole: false,
    cuisine_portugaise: false,
    cuisine_turque: false,
    cuisine_fusion: false,
    diet_vegan: false,
    diet_vegetarian: false,
    diet_gluten_free: false,
    diet_lactose_free: false,
    diet_flexitarien: false,
    diet_casher: false,
    diet_pescetarien: false,
    atmo_cosy: false,
    atmo_instagrammable: false,
    atmo_family_friendly: false,
    atmo_quiet: false,
    atmo_trendy: false,
    atmo_student_friendly: false,
    atmo_romantique: false,
    atmo_business: false,
    atmo_rooftop: false,
    svc_terrace: false,
    svc_wifi: false,
    svc_reservation: false,
    svc_takeaway: false,
    svc_dog_friendly: false,
    svc_baby_friendly: false,
    venue_salon_de_the: false,
    svc_delivery: false,
    svc_parking: false,
    svc_private_dining: false,
    svc_events: false,
    svc_accessible_pmr: false,
    food_tags_overflow: [],
    display_hours: null,
    updated_at: "2026-01-01T00:00:00Z",
  };
  return { ...base, ...overrides };
}

describe("toMcpSummary", () => {
  it("maps basic fields correctly", () => {
    const r = makeRestaurant();
    const summary = toMcpSummary(r);

    expect(summary.id).toBe("rest-001");
    expect(summary.name).toBe("Test Restaurant");
    expect(summary.city).toBe("Paris");
    expect(summary.address).toBe("1 rue Test");
    expect(summary.price_range).toBe(2);
    expect(summary.rating).toBe(4.2);
    expect(summary.excerpt).toBe("A test restaurant");
  });

  it("extracts cuisine flags as French labels", () => {
    const r = makeRestaurant({
      cuisine_francaise: true,
      cuisine_japonaise: true,
    });
    const summary = toMcpSummary(r);
    expect(summary.cuisines).toContain("française");
    expect(summary.cuisines).toContain("japonaise");
    expect(summary.cuisines).toHaveLength(2);
  });

  it("extracts format flags", () => {
    const r = makeRestaurant({
      format_brunch: true,
      format_a_la_carte: true,
    });
    const summary = toMcpSummary(r);
    expect(summary.formats).toContain("brunch");
    expect(summary.formats).toContain("à la carte");
  });

  it("extracts dietary flags", () => {
    const r = makeRestaurant({
      diet_vegan: true,
      diet_gluten_free: true,
    });
    const summary = toMcpSummary(r);
    expect(summary.dietary).toContain("vegan");
    expect(summary.dietary).toContain("sans gluten");
  });

  it("extracts atmosphere flags", () => {
    const r = makeRestaurant({
      atmo_cosy: true,
      atmo_romantique: true,
    });
    const summary = toMcpSummary(r);
    expect(summary.atmosphere).toContain("cosy");
    expect(summary.atmosphere).toContain("romantique");
  });

  it("extracts services flags", () => {
    const r = makeRestaurant({
      svc_terrace: true,
      svc_wifi: true,
    });
    const summary = toMcpSummary(r);
    expect(summary.services).toContain("terrasse");
    expect(summary.services).toContain("wifi");
  });

  it("returns empty arrays when no flags are true", () => {
    const r = makeRestaurant();
    const summary = toMcpSummary(r);
    expect(summary.cuisines).toEqual([]);
    expect(summary.formats).toEqual([]);
    expect(summary.dietary).toEqual([]);
    expect(summary.atmosphere).toEqual([]);
    expect(summary.services).toEqual([]);
  });

  it("appends food_tags_overflow to cuisines", () => {
    const r = makeRestaurant({
      cuisine_francaise: true,
      food_tags_overflow: ["experimental", "molecular"],
    });
    const summary = toMcpSummary(r);
    expect(summary.cuisines).toEqual(["française", "experimental", "molecular"]);
  });

  it("handles null city and address gracefully", () => {
    const r = makeRestaurant({ city_name: null, address: null });
    const summary = toMcpSummary(r);
    expect(summary.city).toBeNull();
    expect(summary.address).toBeNull();
  });
});
