/**
 * Studio catalogs: hairstyles, environments, turnaround views, hair option
 * sets and prompt fragments. All entries are original descriptive text used
 * by the prompt composer — no generated imagery is implied by a catalog entry.
 */
import type { HairOptionSet, HairstyleSelection } from "./types";

export interface HairStyleDef {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  defaults: Partial<Omit<HairstyleSelection, "styleId" | "notes">>;
}

export const HAIR_CATEGORIES = [
  "Long & flowing",
  "Layered",
  "Curly & coily",
  "Braids",
  "Twists",
  "Protective",
  "Elegant updos",
  "Natural",
  "Straight",
  "Voluminous",
];

export const HAIR_STYLES: HairStyleDef[] = [
  {
    id: "long-soft-waves",
    name: "Long Soft Waves",
    category: "Long & flowing",
    description: "Waist-length hair falling in loose, brushed-out waves with a middle part.",
    prompt: "long waist-length hair in loose, glossy brushed-out waves, centre part, face-framing front pieces",
    defaults: { length: "Waist", texture: "Wavy", volume: "Moderate", parting: "Middle", bangs: "None", styling: "Soft waves" },
  },
  {
    id: "long-straight-silk",
    name: "Silk Straight Length",
    category: "Long & flowing",
    description: "Glass-smooth straight hair past the shoulders, cut blunt at the ends.",
    prompt: "long glass-straight silk hair past the shoulder blades, blunt ends, soft centre part",
    defaults: { length: "Mid-back", texture: "Straight", volume: "Sleek", parting: "Middle", styling: "Sleek blowout" },
  },
  {
    id: "long-beach-waves",
    name: "Beach Texture",
    category: "Long & flowing",
    description: "Airy, salt-spray texture with irregular waves and a deep side sweep.",
    prompt: "long airy beach-textured waves, irregular curl pattern, deep side sweep with natural frizz halo",
    defaults: { length: "Mid-back", texture: "Wavy", volume: "Voluminous", parting: "Deep side", styling: "Natural wear" },
  },
  {
    id: "layered-shag",
    name: "Modern Shag",
    category: "Layered",
    description: "Heavy face-framing layers with a curtain fringe and lived-in texture.",
    prompt: "shoulder-length modern shag with heavy face-framing layers, curtain fringe, lived-in texture",
    defaults: { length: "Shoulder", texture: "Wavy", volume: "Voluminous", parting: "Middle", bangs: "Curtain", styling: "Soft waves" },
  },
  {
    id: "layered-long-bob",
    name: "Layered Long Bob",
    category: "Layered",
    description: "Collarbone-grazing lob with invisible internal layers for movement.",
    prompt: "collarbone-length layered bob, invisible internal layers, soft inward bend at the ends",
    defaults: { length: "Shoulder", texture: "Straight", volume: "Moderate", parting: "Left", styling: "Sleek blowout" },
  },
  {
    id: "layered-70s",
    name: "Seventies Layers",
    category: "Layered",
    description: "Rounded, airy layers with a swooping fringe and soft volume at the crown.",
    prompt: "seventies-inspired rounded layers, swooping side fringe, soft crown volume, brushed-out curl ends",
    defaults: { length: "Mid-back", texture: "Wavy", volume: "Voluminous", parting: "Left", bangs: "Side-swept", styling: "Soft waves" },
  },
  {
    id: "curls-defined",
    name: "Defined Curl Set",
    category: "Curly & coily",
    description: "Springy defined curls with a strong hydration sheen and full shape.",
    prompt: "defined springy curls with high hydration sheen, uniform curl clumps, rounded silhouette",
    defaults: { length: "Shoulder", texture: "Defined curls", volume: "Voluminous", parting: "Middle", styling: "Defined curls" },
  },
  {
    id: "curls-halo",
    name: "Curly Halo",
    category: "Curly & coily",
    description: "Soft halo of loose curls framing the face, tapered at the back.",
    prompt: "loose curly halo framing the face, tapered at the nape, soft 3b curl pattern",
    defaults: { length: "Shoulder", texture: "Loose curls", volume: "Voluminous", parting: "Middle", styling: "Natural wear" },
  },
  {
    id: "coily-afro",
    name: "Rounded Coily Afro",
    category: "Curly & coily",
    description: "Full, rounded coily silhouette with visible individual coils.",
    prompt: "full rounded natural coily afro, visible individual coils, even silhouette with soft edges",
    defaults: { length: "Chin", texture: "Coily", volume: "Extra volume", parting: "No part", styling: "Natural wear" },
  },
  {
    id: "braids-knotless",
    name: "Knotless Braids",
    category: "Braids",
    description: "Small knotless braids falling past the waist with a clean centre part.",
    prompt: "small knotless box braids past the waist, clean centre part, neat scalp sectioning",
    defaults: { length: "Waist", texture: "Braided", volume: "Moderate", parting: "Middle", styling: "Natural wear" },
  },
  {
    id: "braids-goddess",
    name: "Goddess Braids",
    category: "Braids",
    description: "Larger braids with loose curly tendrils left out along the length.",
    prompt: "goddess braids with loose curly tendrils along the length, braided crown, soft edges",
    defaults: { length: "Mid-back", texture: "Braided", volume: "Voluminous", parting: "Middle", styling: "Natural wear" },
  },
  {
    id: "braids-crown",
    name: "Braided Crown",
    category: "Braids",
    description: "Braids wrapped into a crown around the head with a soft nape.",
    prompt: "braids wrapped into a crown around the head, neat parting, soft braided nape",
    defaults: { length: "Chin", texture: "Braided", volume: "Moderate", parting: "No part", styling: "Updo" },
  },
  {
    id: "twists-senegal",
    name: "Senegalese Twists",
    category: "Twists",
    description: "Sleek rope twists with a smooth three-strand texture.",
    prompt: "sleek Senegalese rope twists, smooth three-strand texture, neat centre part",
    defaults: { length: "Mid-back", texture: "Twisted", volume: "Moderate", parting: "Middle", styling: "Natural wear" },
  },
  {
    id: "twists-passion",
    name: "Passion Twists",
    category: "Twists",
    description: "Soft, bouncy two-strand twists with a tapered silhouette.",
    prompt: "soft bouncy passion twists, two-strand texture, tapered silhouette with wispy ends",
    defaults: { length: "Shoulder", texture: "Twisted", volume: "Voluminous", parting: "Middle", styling: "Natural wear" },
  },
  {
    id: "twists-mini",
    name: "Mini Twists",
    category: "Twists",
    description: "Fine mini twists worn close to the head for a sculpted look.",
    prompt: "fine mini twists worn close to the head, sculpted silhouette, neat hairline",
    defaults: { length: "Chin", texture: "Twisted", volume: "Sleek", parting: "Left", styling: "Natural wear" },
  },
  {
    id: "protective-headwrap",
    name: "Silk Headwrap",
    category: "Protective",
    description: "Satin headwrap with hair tucked, edges softly laid.",
    prompt: "satin silk headwrap with hair tucked beneath, softly laid edges, sculpted wrap folds",
    defaults: { length: "Chin", texture: "Natural", volume: "Sleek", parting: "No part", styling: "Updo", accessory: "Silk scarf" },
  },
  {
    id: "protective-halo-braid",
    name: "Halo Braid",
    category: "Protective",
    description: "Sweeping halo braid around the crown with a smooth, protective finish.",
    prompt: "sweeping halo braid around the crown, smooth protective finish, soft edges",
    defaults: { length: "Chin", texture: "Braided", volume: "Moderate", parting: "No part", styling: "Updo" },
  },
  {
    id: "protective-bun",
    name: "Protected Satin Bun",
    category: "Protective",
    description: "Low satin-weave bun with a clean parting and sheen.",
    prompt: "low satin-weave bun with a clean centre parting, high sheen, softly laid edges",
    defaults: { length: "Chin", texture: "Natural", volume: "Sleek", parting: "Middle", styling: "Updo" },
  },
  {
    id: "updo-sleek-chignon",
    name: "Sleek Chignon",
    category: "Elegant updos",
    description: "Polished low chignon with a precise middle part and face-framing tendrils.",
    prompt: "polished low chignon, precise centre part, two fine face-framing tendrils, satin sheen",
    defaults: { length: "Shoulder", texture: "Straight", volume: "Sleek", parting: "Middle", styling: "Updo" },
  },
  {
    id: "updo-soft-chignon",
    name: "Romantic Chignon",
    category: "Elegant updos",
    description: "Loosely gathered chignon with soft volume and escaped curls.",
    prompt: "romantic loosely gathered chignon, soft crown volume, escaped curls at the temples",
    defaults: { length: "Shoulder", texture: "Wavy", volume: "Voluminous", parting: "Left", styling: "Updo" },
  },
  {
    id: "updo-high-bun",
    name: "High Ballet Bun",
    category: "Elegant updos",
    description: "High, balanced bun with a smooth crown and clean hairline.",
    prompt: "high balanced ballet bun, smooth crown, clean hairline, subtle sheen",
    defaults: { length: "Shoulder", texture: "Straight", volume: "Sleek", parting: "No part", styling: "Updo" },
  },
  {
    id: "natural-wash-and-go",
    name: "Wash-and-Go",
    category: "Natural",
    description: "Your natural curl pattern, hydrated and defined, falling freely.",
    prompt: "natural wash-and-go, defined hydrated curl pattern falling freely, authentic density",
    defaults: { length: "Natural", texture: "Natural", volume: "Natural", parting: "Natural", styling: "Defined curls" },
  },
  {
    id: "natural-twist-out",
    name: "Twist-Out",
    category: "Natural",
    description: "Stretched, elongated curls from a twist-out set.",
    prompt: "natural twist-out, elongated stretched curls, soft irregular pattern, full shape",
    defaults: { length: "Shoulder", texture: "Coily", volume: "Voluminous", parting: "Middle", styling: "Twist-out" },
  },
  {
    id: "natural-press",
    name: "Natural Silk Press",
    category: "Natural",
    description: "Natural hair pressed bone-straight with swing and mirror shine.",
    prompt: "natural hair silk-pressed bone straight, high shine, soft swing and movement",
    defaults: { length: "Mid-back", texture: "Straight", volume: "Moderate", parting: "Left", styling: "Sleek blowout" },
  },
  {
    id: "straight-blunt",
    name: "Blunt Cut",
    category: "Straight",
    description: "Sharp one-length blunt cut at the collarbone with a middle part.",
    prompt: "sharp one-length blunt cut at the collarbone, precise middle part, mirror-smooth finish",
    defaults: { length: "Shoulder", texture: "Straight", volume: "Sleek", parting: "Middle", styling: "Sleek blowout" },
  },
  {
    id: "straight-pixie",
    name: "Sculpted Pixie",
    category: "Straight",
    description: "Cropped pixie with a longer top and softly tapered sides.",
    prompt: "short sculpted pixie cut, longer textured top, softly tapered sides and nape",
    defaults: { length: "Pixie", texture: "Straight", volume: "Moderate", parting: "Deep side", styling: "Sleek blowout" },
  },
  {
    id: "voluminous-blowout",
    name: "Nineties Blowout",
    category: "Voluminous",
    description: "Big, rounded blowout with bouncy ends and lifted roots.",
    prompt: "big rounded nineties blowout, lifted roots, bouncy inward-curled ends, high shine",
    defaults: { length: "Mid-back", texture: "Straight", volume: "Extra volume", parting: "Deep side", bangs: "Curtain", styling: "Sleek blowout" },
  },
  {
    id: "voluminous-curls",
    name: "Volumised Curls",
    category: "Voluminous",
    description: "Root-lifted, separated curls with maximum movement.",
    prompt: "root-lifted voluminous separated curls, maximum movement, soft definition",
    defaults: { length: "Shoulder", texture: "Defined curls", volume: "Extra volume", parting: "Middle", styling: "Defined curls" },
  },
];

export const HAIR_STYLE_MAP: Record<string, HairStyleDef> = Object.fromEntries(
  HAIR_STYLES.map((s) => [s.id, s]),
);

export const HAIR_OPTIONS: HairOptionSet[] = [
  {
    key: "length",
    label: "Length",
    options: ["Natural", "Pixie", "Chin", "Shoulder", "Mid-back", "Waist", "Hip"],
  },
  {
    key: "color",
    label: "Color",
    options: [
      "Natural",
      "Soft black",
      "Espresso",
      "Warm brown",
      "Honey brown",
      "Chestnut",
      "Auburn",
      "Copper",
      "Burgundy",
      "Plum",
      "Blonde",
      "Platinum",
      "Silver",
    ],
  },
  {
    key: "texture",
    label: "Texture",
    options: ["Natural", "Straight", "Wavy", "Loose curls", "Defined curls", "Coily", "Braided", "Twisted"],
  },
  {
    key: "volume",
    label: "Volume",
    options: ["Natural", "Sleek", "Moderate", "Voluminous", "Extra volume"],
  },
  {
    key: "parting",
    label: "Parting",
    options: ["Natural", "Middle", "Left", "Right", "Deep side", "No part"],
  },
  {
    key: "bangs",
    label: "Bangs",
    options: ["None", "Curtain", "Side-swept", "Blunt fringe", "Wispy", "Baby hairs"],
  },
  {
    key: "styling",
    label: "Styling",
    options: ["Natural wear", "Sleek blowout", "Soft waves", "Defined curls", "Twist-out", "Braid-out", "Updo", "Half-up", "Ponytail"],
  },
  {
    key: "accessory",
    label: "Accessory",
    options: ["None", "Gold clips", "Pearl pins", "Silk scarf", "Headband", "Hair jewelry"],
  },
];

export function defaultHairstyle(): HairstyleSelection {
  return {
    styleId: "long-soft-waves",
    length: "Waist",
    color: "Espresso",
    texture: "Wavy",
    volume: "Moderate",
    parting: "Middle",
    bangs: "None",
    styling: "Soft waves",
    accessory: "None",
    notes: "",
  };
}

/** Human-readable summary of a hairstyle selection, used in prompts and exports. */
export function hairstyleSentence(h: HairstyleSelection): string {
  const style = HAIR_STYLE_MAP[h.styleId];
  const base = style ? style.prompt : "hair styled naturally";
  const parts: string[] = [base];
  if (h.color && h.color !== "Natural") parts.push(`${h.color.toLowerCase()} hair color`);
  if (h.accessory && h.accessory !== "None") parts.push(`${h.accessory.toLowerCase()} woven into the hair`);
  if (h.notes.trim()) parts.push(h.notes.trim());
  return parts.join(", ");
}

/* ------------------------------------------------------------------ */
/* Environments                                                        */
/* ------------------------------------------------------------------ */

export interface EnvironmentDef {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  lighting: string;
  palette: [string, string, string];
  sceneTag: string;
}

export const ENVIRONMENTS: EnvironmentDef[] = [
  {
    id: "recording-studio",
    name: "Professional Recording Studio",
    category: "Music",
    description: "Acoustic-treated walls, a large-diaphragm condenser and warm studio monitoring light.",
    prompt:
      "inside a professional recording studio, acoustic wood diffuser panels, large-diaphragm condenser microphone just outside frame, warm tungsten key light and soft blue monitor glow",
    lighting: "Warm tungsten key, cool monitor fill",
    palette: ["#2B2620", "#6B563E", "#C8A96E"],
    sceneTag: "Session",
  },
  {
    id: "home-studio",
    name: "Home Recording Space",
    category: "Music",
    description: "Intimate bedroom studio with foam panels, a laptop and window daylight.",
    prompt:
      "in a tidy home recording setup, acoustic foam panels, laptop and audio interface, soft window daylight, lived-in warmth",
    lighting: "Soft window daylight",
    palette: ["#3A332C", "#8A7358", "#E1D2B8"],
    sceneTag: "Bedroom",
  },
  {
    id: "concert-stage",
    name: "Concert Stage",
    category: "Performance",
    description: "Full performance staging with haze, moving beams and a dark crowd beyond the lip of the stage.",
    prompt:
      "on a large concert stage, atmospheric haze, dramatic moving beam lights, dark audience silhouettes beyond the stage edge, subtle lens flare",
    lighting: "Hard stage beams, haze",
    palette: ["#100F14", "#3B2A4A", "#D9B26A"],
    sceneTag: "Live",
  },
  {
    id: "worship",
    name: "Worship Setting",
    category: "Performance",
    description: "Reverent stage light, warm haze and a soft congregation glow.",
    prompt:
      "in a modern worship auditorium, warm amber stage wash, soft haze, gentle spotlight, dark calm background",
    lighting: "Warm amber wash, haze",
    palette: ["#1C1A17", "#5A4632", "#E6C68C"],
    sceneTag: "Worship",
  },
  {
    id: "music-video",
    name: "Cinematic Music Video",
    category: "Cinematic",
    description: "Anamorphic night interior with practical lights, rain on glass and deep shadows.",
    prompt:
      "cinematic music video frame, anamorphic night interior, practical neon accents, rain on window glass, deep shadow falloff, film grain",
    lighting: "Practical neon, hard rim",
    palette: ["#0E1116", "#22405A", "#D98E6A"],
    sceneTag: "Music video",
  },
  {
    id: "outdoor",
    name: "Outdoor Golden Hour",
    category: "Natural",
    description: "Open landscape at last light with soft backlight and warm haze.",
    prompt:
      "outdoors in open landscape at golden hour, low warm sun backlight, atmospheric haze, shallow depth of field, natural wind in hair",
    lighting: "Golden-hour backlight",
    palette: ["#3B3527", "#A08556", "#F0D9AE"],
    sceneTag: "Golden hour",
  },
  {
    id: "photo-studio",
    name: "Elegant Photography Studio",
    category: "Studio",
    description: "Seamless neutral backdrop, soft beauty key and a silver reflector.",
    prompt:
      "elegant photography studio, seamless warm grey backdrop, soft beauty key with large modifier, silver fill reflector, clean editorial framing",
    lighting: "Soft beauty key, fill",
    palette: ["#4A4642", "#8C8478", "#E8DFD0"],
    sceneTag: "Editorial",
  },
  {
    id: "interview",
    name: "Interview Set",
    category: "Media",
    description: "Relaxed seated interview framing with shallow background separation.",
    prompt:
      "seated interview set, shallow depth of field, softly out-of-focus warm background, conversational framing, subtle practical lamps",
    lighting: "Soft interview key",
    palette: ["#2A2724", "#5E564C", "#CBB99A"],
    sceneTag: "Interview",
  },
  {
    id: "youtube-set",
    name: "YouTube Presentation",
    category: "Media",
    description: "Clean creator set with controlled color accents and crisp front light.",
    prompt:
      "clean creator studio set, subtle colored practical accents in the background, crisp soft front light, tidy presentation framing",
    lighting: "Crisp soft front key",
    palette: ["#24272B", "#4C5A63", "#D8C49B"],
    sceneTag: "Creator",
  },
  {
    id: "vocal-booth",
    name: "Vocal Booth",
    category: "Music",
    description: "Close, dry booth with felt walls and a pop filter in frame.",
    prompt:
      "inside a dry vocal booth, felt acoustic walls, pop filter and microphone at frame edge, close intimate framing",
    lighting: "Close warm key",
    palette: ["#241F1A", "#524437", "#BFA070"],
    sceneTag: "Booth",
  },
  {
    id: "rooftop",
    name: "Rooftop at Dusk",
    category: "Cinematic",
    description: "City skyline bokeh behind, cool dusk ambient with warm practical light.",
    prompt:
      "rooftop at dusk, city skyline bokeh behind, cool ambient dusk light mixed with warm practical lamps, gentle wind",
    lighting: "Cool ambient, warm practicals",
    palette: ["#141A22", "#38495C", "#E0B987"],
    sceneTag: "Rooftop",
  },
  {
    id: "editorial-black",
    name: "Editorial Black",
    category: "Studio",
    description: "Pure black set with one sculpted light for a dramatic portrait.",
    prompt:
      "pure black studio set, single sculpted hard light with soft falloff, dramatic editorial portrait, minimal props",
    lighting: "Single sculpted hard light",
    palette: ["#0B0B0C", "#2A2A2E", "#C9AE7C"],
    sceneTag: "Editorial",
  },
];

export const ENVIRONMENT_MAP: Record<string, EnvironmentDef> = Object.fromEntries(
  ENVIRONMENTS.map((e) => [e.id, e]),
);

/* ------------------------------------------------------------------ */
/* Turnaround                                                          */
/* ------------------------------------------------------------------ */

export interface TurnaroundView {
  key: string;
  label: string;
  short: string;
  prompt: string;
  faceVisible: boolean;
  fullBody: boolean;
}

export const TURNAROUND_VIEWS: TurnaroundView[] = [
  {
    key: "front",
    label: "Straight-on front",
    short: "Front",
    prompt:
      "full-face straight-on front view, camera exactly level with the eyes, neutral relaxed expression, both ears visible, symmetrical framing",
    faceVisible: true,
    fullBody: false,
  },
  {
    key: "threeQuarterLeft",
    label: "Front three-quarter left",
    short: "3/4 L",
    prompt:
      "front three-quarter view turned about 45 degrees to the subject's left, camera level with the eyes, neutral expression, both eyes visible",
    faceVisible: true,
    fullBody: false,
  },
  {
    key: "threeQuarterRight",
    label: "Front three-quarter right",
    short: "3/4 R",
    prompt:
      "front three-quarter view turned about 45 degrees to the subject's right, camera level with the eyes, neutral expression, both eyes visible",
    faceVisible: true,
    fullBody: false,
  },
  {
    key: "leftProfile",
    label: "Left profile",
    short: "Left profile",
    prompt:
      "true left profile view, 90 degrees, camera level, nose bridge and ear fully visible, neutral expression, hair tucked behind the ear on the visible side",
    faceVisible: true,
    fullBody: false,
  },
  {
    key: "rightProfile",
    label: "Right profile",
    short: "Right profile",
    prompt:
      "true right profile view, 90 degrees, camera level, nose bridge and ear fully visible, neutral expression, hair tucked behind the ear on the visible side",
    faceVisible: true,
    fullBody: false,
  },
  {
    key: "backHead",
    label: "Back of head",
    short: "Back",
    prompt:
      "back of the head view from behind, hairline at the nape and full hair silhouette clearly visible, shoulders level, no face visible",
    faceVisible: false,
    fullBody: false,
  },
  {
    key: "fullBodyFront",
    label: "Full body front",
    short: "Body front",
    prompt:
      "full-body straight-on front view from head to feet, relaxed standing pose, arms at sides, visible full body proportions, neutral background",
    faceVisible: true,
    fullBody: true,
  },
  {
    key: "fullBodySide",
    label: "Full body side",
    short: "Body side",
    prompt:
      "full-body side view from head to feet, standing profile, arms relaxed, visible body proportions and posture, neutral background",
    faceVisible: true,
    fullBody: true,
  },
  {
    key: "fullBodyBack",
    label: "Full body back",
    short: "Body back",
    prompt:
      "full-body back view from head to feet, standing with arms relaxed, visible back silhouette and body proportions, neutral background",
    faceVisible: false,
    fullBody: true,
  },
];
