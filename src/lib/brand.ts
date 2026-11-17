import type { Pillar, Status, Format } from "./types";

/**
 * Roopip brand profile. Sources: the October 2026 social media plan, the
 * Social Media Manager start-up checklist, and Daniel's edits to the plan doc.
 */
export const BRAND = {
  name: "Roopip",
  tagline: "Elegant rope designs for beautifully considered spaces.",
  positioning:
    "Handmade in Knysna, South Africa, from sun-dyed cotton and water-resistant polypropylene rope.",
  direction: ["Natural", "Warm", "Timeless", "Textural", "Premium", "Minimal"],
  voice: [
    "Warm",
    "Elegant",
    "Natural",
    "Knowledgeable",
    "Simple",
    "Premium but approachable",
    "Not overly sales-focused",
  ],
  audience:
    "Adults 30 to 65, mainly South Africa, who love calm, elegant, neutral interiors and value handmade and local.",
  photoDirection:
    "Natural light, soft shadows, warm tones, close textures. Products are the heroes: minimalist decor, linen, light wooden tables.",
  approvedClaims: [
    "Handmade in Knysna, South Africa",
    "Rope (cotton and polypropylene) made in South Africa",
    "Cotton rope sun-dyed by hand in small batches, without electricity",
    "Suitable offcuts are turned into smaller pieces (the Creative range)",
    "Polypropylene is water-resistant (not waterproof)",
  ],
  palette: [
    { name: "Warm Ivory", hex: "#F3F0E9" },
    { name: "Rope Beige", hex: "#E6CCB1" },
    { name: "Sandstone", hex: "#C3AFA0" },
    { name: "Caramel", hex: "#A17A5E" },
    { name: "Muted Olive", hex: "#68705A" },
    { name: "Deep Espresso", hex: "#332A22" },
  ],
  fonts: { heading: "Cormorant Garamond", body: "DM Sans" },
  baseHashtags: ["#roopip", "#handmadeinknysna", "#ropedecor", "#madeinsouthafrica"],
  links: {
    driveBrandAssets: "1xaZo0ka-ivVfoJreG2zgMdfAGZU08guq",
    driveProductPhotos: "1xPLGLlm_TfETFbjZ1oH6-R_XZE829uDV",
    productSheet: "1qVv9XyEMTR0-DGG6EID49dnKz1Kn-EfWtv6hSTNSQHg",
  },
} as const;

export const PILLARS: Pillar[] = [
  "Product",
  "Lifestyle",
  "Craftsmanship",
  "Education",
  "Brand story",
  "Community",
];

export const STATUS_ORDER: Status[] = [
  "idea",
  "media",
  "editing",
  "review",
  "approved",
  "scheduled",
  "posted",
];

export const STATUS_LABEL: Record<Status, string> = {
  idea: "Idea",
  media: "Media added",
  editing: "Editing",
  review: "Ready for approval",
  approved: "Approved",
  scheduled: "Scheduled",
  posted: "Posted",
};

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reel",
  story: "Story",
  post: "Post",
  carousel: "Carousel",
};
