export interface RestaurantSummary {
  id: string; // google_place_id
  name: string;
  city: string | null;
  address: string | null;
  cuisines: string[];        // ["française", "japonaise"]
  formats: string[];         // ["brunch", "à la carte"]
  dietary: string[];         // ["vegan", "gluten_free"]
  atmosphere: string[];      // ["cosy", "terrasse"]
  services: string[];        // ["wifi", "takeaway"]
  price_range: 1 | 2 | 3 | 4 | null;
  rating: number | null;
  excerpt: string | null;    // plain text, pas HTML
}