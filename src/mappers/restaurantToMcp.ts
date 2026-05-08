import type { Restaurant } from "../types/restaurant.js";
import type { RestaurantSummary } from "../types/mcp.js";

const TAG_GROUPS = {
  cuisines: {
    cuisine_francaise: "française",
    cuisine_italienne: "italienne",
    cuisine_japonaise: "japonaise",
    cuisine_americaine: "américaine",
    cuisine_mediterraneenne: "méditerranéenne",
    cuisine_orientale: "orientale",
    cuisine_asiatique: "asiatique",
    cuisine_latino: "latino",
    cuisine_brasserie: "brasserie",
    cuisine_street_food: "street food",
    cuisine_halal: "halal",
    cuisine_indienne: "indienne",
    cuisine_thailandaise: "thaïlandaise",
    cuisine_coreenne: "coréenne",
    cuisine_africaine: "africaine",
    cuisine_libanaise: "libanaise",
    cuisine_mexicaine: "mexicaine",
    cuisine_peruvienne: "péruvienne",
    cuisine_vietnamienne: "vietnamienne",
    cuisine_chinoise: "chinoise",
    cuisine_grecque: "grecque",
    cuisine_espagnole: "espagnole",
    cuisine_portugaise: "portugaise",
    cuisine_turque: "turque",
    cuisine_fusion: "fusion",
  },
  formats: {
    format_brunch: "brunch",
    format_a_la_carte: "à la carte",
    format_formule: "formule",
    format_menu_du_jour: "menu du jour",
    format_menu_degustation: "menu dégustation",
    format_buffet: "buffet",
    format_a_composer: "à composer",
    format_all_day: "all day",
    format_dominical: "dominical",
    format_a_theme: "à thème",
    format_show_cooking: "show cooking",
    format_afterwork: "afterwork",
    format_privatisation: "privatisation",
    format_traiteur: "traiteur",
  },
  food: {
    food_fait_maison: "fait maison",
    food_bio: "bio",
    food_local: "local",
    food_saison: "de saison",
    food_frais: "frais",
    food_healthy: "healthy",
    food_comfort_food: "comfort food",
    food_gastronomique: "gastronomique",
    food_genereux: "généreux",
    food_createur: "créateur",
    food_traditionnel: "traditionnel",
    food_patisserie: "pâtisserie",
    food_specialty_coffee: "specialty coffee",
    food_zero_dechet: "zéro déchet",
    food_fumage: "fumage",
    food_fermentation: "fermentation",
    food_nose_to_tail: "nose to tail",
    food_seafood: "fruits de mer",
  },
  dietary: {
    diet_vegan: "vegan",
    diet_vegetarian: "végétarien",
    diet_gluten_free: "sans gluten",
    diet_lactose_free: "sans lactose",
    diet_flexitarien: "flexitarien",
    diet_casher: "casher",
    diet_pescetarien: "pescétarien",
  },
  atmosphere: {
    atmo_cosy: "cosy",
    atmo_romantique: "romantique",
    atmo_trendy: "trendy",
    atmo_quiet: "calme",
    atmo_family_friendly: "family-friendly",
    atmo_student_friendly: "student-friendly",
    atmo_business: "business",
    atmo_rooftop: "rooftop",
    atmo_instagrammable: "instagrammable",
  },
  services: {
    svc_terrace: "terrasse",
    svc_wifi: "wifi",
    svc_takeaway: "à emporter",
    svc_delivery: "livraison",
    svc_parking: "parking",
    svc_dog_friendly: "dog-friendly",
    svc_baby_friendly: "baby-friendly",
    svc_private_dining: "salon privatif",
    svc_events: "événements",
    svc_accessible_pmr: "accessible PMR",
    venue_salon_de_the: "salon de thé",
  },
} as const;

function extract(r: Restaurant, group: keyof typeof TAG_GROUPS): string[] {
  const map = TAG_GROUPS[group] as Record<string, string>;
  return Object.entries(map)
    .filter(([flag]) => r[flag as keyof Restaurant] === true)
    .map(([, label]) => label);
}

export function toMcpSummary(r: Restaurant): RestaurantSummary {
  const cuisines = extract(r, "cuisines");
  if (r.food_tags_overflow.length) {
    cuisines.push(...r.food_tags_overflow);
  }

  return {
    id: r.id,
    name: r.name,
    city: r.city_name,
    address: r.address,
    cuisines,
    formats: extract(r, "formats"),
    dietary: extract(r, "dietary"),
    atmosphere: extract(r, "atmosphere"),
    services: extract(r, "services"),
    price_range: r.price_range,
    rating: r.rating,
    excerpt: r.excerpt,
  };
}