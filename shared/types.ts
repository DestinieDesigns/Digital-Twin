/**
 * Destinie AI Twin Studio — shared domain types.
 * Imported by the Bun API server and the React client so the identity model
 * has exactly one definition.
 */

export type ViewKey =
  | "front"
  | "threeQuarterLeft"
  | "threeQuarterRight"
  | "leftProfile"
  | "rightProfile"
  | "smiling"
  | "neutral"
  | "fullBody"
  | "backHead"
  | "other";

export interface ViewDefinition {
  key: ViewKey;
  label: string;
  hint: string;
  faceVisible: boolean;
}

export const VIEWS: ViewDefinition[] = [
  { key: "front", label: "Front-facing", hint: "Camera level with your eyes, straight on.", faceVisible: true },
  { key: "threeQuarterLeft", label: "Three-quarter left", hint: "Turned ~45° to your left.", faceVisible: true },
  { key: "threeQuarterRight", label: "Three-quarter right", hint: "Turned ~45° to your right.", faceVisible: true },
  { key: "leftProfile", label: "Left profile", hint: "Full side view, ears visible.", faceVisible: true },
  { key: "rightProfile", label: "Right profile", hint: "Full side view, ears visible.", faceVisible: true },
  { key: "smiling", label: "Smiling", hint: "Your natural, relaxed smile.", faceVisible: true },
  { key: "neutral", label: "Neutral expression", hint: "Relaxed face, no expression.", faceVisible: true },
  { key: "fullBody", label: "Full body", hint: "Head to feet, for body proportions.", faceVisible: true },
  { key: "backHead", label: "Back of head", hint: "Hairline and hair length from behind.", faceVisible: false },
  { key: "other", label: "Other / styling", hint: "Alternate hairstyle, makeup or lighting.", faceVisible: true },
];

export const VIEW_LABELS: Record<ViewKey, string> = Object.fromEntries(
  VIEWS.map((v) => [v.key, v.label]),
) as Record<ViewKey, string>;

/* ------------------------------------------------------------------ */
/* Identity features                                                   */
/* ------------------------------------------------------------------ */

export interface FeatureDefinition {
  key: string;
  label: string;
  help: string;
  /** Reference views required. Outer array = all required; inner array = any one of. */
  requires: ViewKey[][];
  /** Measurement keys that can substantiate this feature when present. */
  measurements?: string[];
  placeholder: string;
}

export const FEATURES: FeatureDefinition[] = [
  {
    key: "faceShape",
    label: "Natural face shape",
    help: "Overall silhouette — oval, round, square, heart, diamond or oblong, and how the width sits against the length.",
    requires: [["front"], ["threeQuarterLeft", "threeQuarterRight"]],
    measurements: ["faceLengthWidth"],
    placeholder: "e.g. Soft heart shape — wider cheekbones narrowing to a defined chin",
  },
  {
    key: "proportions",
    label: "Facial proportions",
    help: "Vertical thirds and the balance between eyes, nose and mouth. Measured from a front-facing photograph when possible.",
    requires: [["front"]],
    measurements: ["upperThird", "midThird", "lowerThird", "faceLengthWidth", "eyeSpacing"],
    placeholder: "e.g. Balanced thirds with a slightly shorter lower third",
  },
  {
    key: "forehead",
    label: "Forehead shape and size",
    help: "Height, width, hairline shape and whether it is flat or rounded.",
    requires: [["front"], ["threeQuarterLeft", "threeQuarterRight"]],
    measurements: ["foreheadHeight"],
    placeholder: "e.g. Broad, gently rounded forehead with a soft rounded hairline",
  },
  {
    key: "eyes",
    label: "Eye shape, spacing and color",
    help: "Lid shape, visible crease, outer-corner tilt, spacing between the eyes, and the true iris color.",
    requires: [["front"]],
    measurements: ["eyeSpacing", "eyeWidth", "eyeAspect", "canthalTilt"],
    placeholder: "e.g. Almond eyes, slight positive tilt, deep brown iris, wide-set",
  },
  {
    key: "brows",
    label: "Eyebrow shape",
    help: "Arch height, thickness, tail length, and the gap between brow and eye.",
    requires: [["front"]],
    measurements: ["browEyeGap"],
    placeholder: "e.g. Softly arched, medium thickness, tapered tail",
  },
  {
    key: "nose",
    label: "Nose structure",
    help: "Bridge width, tip shape, nostril width and the profile line. A side profile is required so the bridge is not guessed.",
    requires: [["front"], ["leftProfile", "rightProfile"]],
    measurements: ["noseWidth"],
    placeholder: "e.g. Straight bridge with a rounded tip, medium-width alar base",
  },
  {
    key: "lips",
    label: "Lip shape and proportions",
    help: "Upper-to-lower balance, cupid's bow, fullness and resting mouth width.",
    requires: [["front"]],
    measurements: ["mouthWidth", "upperLowerLip"],
    placeholder: "e.g. Full lower lip, defined cupid's bow, balanced width",
  },
  {
    key: "cheekbones",
    label: "Cheekbones",
    help: "Height and prominence of the cheekbones and how they read from three-quarter angles.",
    requires: [["front"], ["threeQuarterLeft", "threeQuarterRight"]],
    placeholder: "e.g. Medium-high cheekbones with a soft, rounded front",
  },
  {
    key: "jawline",
    label: "Jawline",
    help: "Jaw width, angle sharpness and the transition to the neck.",
    requires: [["front"], ["leftProfile", "rightProfile"]],
    measurements: ["jawWidth"],
    placeholder: "e.g. Softly squared jaw, defined but not angular",
  },
  {
    key: "chin",
    label: "Chin",
    help: "Width, projection and shape from the front and in profile.",
    requires: [["front"], ["leftProfile", "rightProfile"]],
    measurements: ["chinProjection"],
    placeholder: "e.g. Rounded chin, subtle forward projection",
  },
  {
    key: "ears",
    label: "Ears",
    help: "Size, set and whether they sit close to the head. Visible in profile or three-quarter views.",
    requires: [["leftProfile", "rightProfile", "threeQuarterLeft", "threeQuarterRight"]],
    placeholder: "e.g. Medium ears sitting close to the head",
  },
  {
    key: "skin",
    label: "Skin tone and undertones",
    help: "Measured from a cheek patch on an evenly lit front photograph, then checked by eye.",
    requires: [["front"]],
    placeholder: "e.g. Medium-deep warm skin with golden undertones",
  },
  {
    key: "marks",
    label: "Distinctive facial characteristics",
    help: "Only what is actually visible — moles, freckles, dimples, scars, asymmetry, dental smile line, glasses. Never invent these.",
    requires: [["front"]],
    placeholder: "e.g. Small mole left cheekbone; slight asymmetry in the right brow",
  },
  {
    key: "smile",
    label: "Natural smile",
    help: "How the mouth, cheeks and eyes move in a genuine smile. Needs a smiling photograph.",
    requires: [["smiling"]],
    placeholder: "e.g. Wide, warm smile, upper teeth visible, eyes crease",
  },
];

/* ------------------------------------------------------------------ */
/* Measurements                                                        */
/* ------------------------------------------------------------------ */

export interface MeasurementDefinition {
  key: string;
  label: string;
  unit: "ratio" | "percent" | "degrees";
  digits: number;
  meaning: string;
}

export const MEASUREMENTS: MeasurementDefinition[] = [
  { key: "faceLengthWidth", label: "Face length ÷ width", unit: "ratio", digits: 2, meaning: "Normalised facial index from front view." },
  { key: "upperThird", label: "Upper third", unit: "percent", digits: 1, meaning: "Hairline to brow, share of face height." },
  { key: "midThird", label: "Middle third", unit: "percent", digits: 1, meaning: "Brow to nose base, share of face height." },
  { key: "lowerThird", label: "Lower third", unit: "percent", digits: 1, meaning: "Nose base to chin, share of face height." },
  { key: "foreheadHeight", label: "Forehead height", unit: "percent", digits: 1, meaning: "Hairline to brow, of face height." },
  { key: "eyeSpacing", label: "Eye spacing", unit: "percent", digits: 1, meaning: "Inner-corner distance, of face width." },
  { key: "eyeWidth", label: "Eye width", unit: "percent", digits: 1, meaning: "Average palpebral width, of face width." },
  { key: "eyeAspect", label: "Eye openness", unit: "ratio", digits: 2, meaning: "Eyelid height ÷ eye width." },
  { key: "canthalTilt", label: "Canthal tilt", unit: "degrees", digits: 1, meaning: "Outer vs inner eye corner angle." },
  { key: "browEyeGap", label: "Brow–eye gap", unit: "percent", digits: 1, meaning: "Brow to upper lid, of face height." },
  { key: "noseWidth", label: "Nose width", unit: "percent", digits: 1, meaning: "Alar width, of face width." },
  { key: "mouthWidth", label: "Mouth width", unit: "percent", digits: 1, meaning: "Corner to corner at rest, of face width." },
  { key: "upperLowerLip", label: "Upper ÷ lower lip", unit: "ratio", digits: 2, meaning: "Vermillion balance." },
  { key: "jawWidth", label: "Jaw width", unit: "percent", digits: 1, meaning: "Bigonial width, of face width." },
  { key: "chinProjection", label: "Chin projection", unit: "percent", digits: 1, meaning: "Lower lip to chin, of face height." },
  { key: "symmetry", label: "Bilateral symmetry", unit: "percent", digits: 1, meaning: "Landmark mirror agreement across the midline." },
];

export const MEASUREMENT_KEYS = MEASUREMENTS.map((m) => m.key);
export type MeasurementKey = (typeof MEASUREMENTS)[number]["key"];

export type Provenance = "user" | "measured" | "missing";

export interface FaceAnalysis {
  analyzedAt: string;
  method: string;
  landmarks: number;
  faceDetected: boolean;
  measurements: Record<string, number>;
  skinTone: {
    hex: string;
    labL: number;
    labA: number;
    labB: number;
    ita: number;
    undertone: "warm" | "cool" | "neutral";
    method: string;
  } | null;
  expressions: Record<string, number> | null;
  framing: {
    roll: number;
    yawEstimate: number;
    faceAreaRatio: number;
    sharpness: number;
  } | null;
  warnings: string[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Identity profile + versions                                         */
/* ------------------------------------------------------------------ */

export interface FeatureValue {
  value: string;
  source: Provenance;
}

export interface DistinguishingMark {
  id: string;
  label: string;
  location: string;
  note: string;
}

export interface IdentityProfile {
  displayName: string;
  summary: string;
  features: Record<string, FeatureValue>;
  marks: DistinguishingMark[];
  measurements: Record<string, number>;
  skin: {
    hex: string;
    undertone: "warm" | "cool" | "neutral" | "unspecified";
    description: string;
    source: Provenance;
  };
  smile: { description: string; source: Provenance };
  signatureHairstyleId: string;
  hairstyle: HairstyleSelection;
  appearance: AppearanceSettings;
  identityStrength: number;
  notes: string;
}

export interface Identity {
  id: string;
  name: string;
  createdAt: string;
  masterVersionId: string | null;
  masterPhotoId: string | null;
}

export type VersionStatus = "draft" | "approved" | "superseded" | "rejected";

export interface IdentityVersion {
  id: string;
  identityId: string;
  number: number;
  label: string;
  status: VersionStatus;
  profile: IdentityProfile;
  createdAt: string;
  approvedAt: string | null;
  notes: string;
  basedOn: string | null;
  changeSummary: string;
}

/* ------------------------------------------------------------------ */
/* Appearance engine                                                   */
/* ------------------------------------------------------------------ */

export interface AppearanceControl {
  key: string;
  label: string;
  group: "Skin" | "Light" | "Makeup" | "Finish";
  help: string;
  min: number;
  max: number;
  /** Identity-safe ceiling. The server clamps every value to this. */
  safeMax: number;
  defaultValue: number;
  /** Prompt phrase for a 0–33 / 34–66 / 67–100 value. */
  phrases: [string, string, string];
}

export const APPEARANCE_CONTROLS: AppearanceControl[] = [
  {
    key: "skinClarity",
    label: "Skin clarity",
    group: "Skin",
    help: "Even-out temporary blemishes while keeping real texture and pores.",
    min: 0,
    max: 100,
    safeMax: 70,
    defaultValue: 45,
    phrases: [
      "skin left completely natural with visible texture and pores",
      "clear, healthy skin with natural texture, pores and fine vellus hair intact",
      "even, well-rested skin with fine natural texture; no airbrushing",
    ],
  },
  {
    key: "skinTexture",
    label: "Texture realism",
    group: "Skin",
    help: "Keeps photographic pore and micro-texture detail at full strength.",
    min: 0,
    max: 100,
    safeMax: 95,
    defaultValue: 80,
    phrases: [
      "softly diffused skin texture",
      "photographic skin texture with visible pores and fine lines",
      "high-detail photographic skin: pores, fine lines, natural sheen, peach fuzz",
    ],
  },
  {
    key: "lighting",
    label: "Lighting polish",
    group: "Light",
    help: "Balanced, flattering light without changing bone structure.",
    min: 0,
    max: 100,
    safeMax: 85,
    defaultValue: 60,
    phrases: [
      "simple ambient lighting",
      "soft balanced key light with gentle fill, flattering shadow falloff",
      "professional three-point beauty lighting, soft key, subtle rim light",
    ],
  },
  {
    key: "makeupBase",
    label: "Base & complexion",
    group: "Makeup",
    help: "Sheer, skin-like finish. Never a mask or a different skin tone.",
    min: 0,
    max: 100,
    safeMax: 55,
    defaultValue: 30,
    phrases: [
      "bare skin, no makeup",
      "sheer natural base, skin still visible",
      "light professional complexion work with a luminous skin-like finish",
    ],
  },
  {
    key: "makeupEyes",
    label: "Eye definition",
    group: "Makeup",
    help: "Liner, lash and shadow definition that keeps the eye shape unchanged.",
    min: 0,
    max: 100,
    safeMax: 60,
    defaultValue: 35,
    phrases: [
      "no eye makeup",
      "soft natural eye definition, subtle liner and mascara",
      "polished editorial eye makeup, defined lashes and soft shadow",
    ],
  },
  {
    key: "makeupLips",
    label: "Lip finish",
    group: "Makeup",
    help: "Color and finish only — the lip shape never changes.",
    min: 0,
    max: 100,
    safeMax: 55,
    defaultValue: 30,
    phrases: [
      "bare lips with natural color",
      "sheer tinted balm on natural lips",
      "soft satin lip color, natural lip line preserved",
    ],
  },
  {
    key: "makeupBrows",
    label: "Brow grooming",
    group: "Makeup",
    help: "Tidy and define the existing brow shape; never reshape or raise it.",
    min: 0,
    max: 100,
    safeMax: 50,
    defaultValue: 25,
    phrases: [
      "brows left exactly as photographed",
      "neatly groomed brows following the natural arch",
      "defined, feather-stroked brows preserving the natural shape and height",
    ],
  },
  {
    key: "grooming",
    label: "Hair & styling finish",
    group: "Finish",
    help: "Flyaway control and polish on the chosen hairstyle.",
    min: 0,
    max: 100,
    safeMax: 70,
    defaultValue: 40,
    phrases: [
      "hair worn loosely and naturally",
      "well-kept hair with natural movement",
      "salon-finished hair, polished with fine individual strands visible",
    ],
  },
  {
    key: "colorGrade",
    label: "Color grade",
    group: "Finish",
    help: "Warm, neutral or cool grade over true skin tones.",
    min: 0,
    max: 100,
    safeMax: 65,
    defaultValue: 40,
    phrases: [
      "neutral color, true-to-life skin tones",
      "gently warmed grade with accurate skin tones",
      "cinematic warm grade, skin tones still true to reference",
    ],
  },
  {
    key: "identityGuard",
    label: "Identity fidelity",
    group: "Finish",
    help: "How hard the generator is held to the approved face. Below 55 is unsafe and is clamped.",
    min: 55,
    max: 100,
    safeMax: 100,
    defaultValue: 88,
    phrases: [
      "reference face followed closely",
      "reference face followed precisely",
      "reference face reproduced exactly, bone structure unchanged",
    ],
  },
];

export type AppearanceSettings = Record<string, number>;

export function defaultAppearance(): AppearanceSettings {
  const out: AppearanceSettings = {};
  for (const c of APPEARANCE_CONTROLS) out[c.key] = c.defaultValue;
  return out;
}

/* ------------------------------------------------------------------ */
/* Hairstyle                                                           */
/* ------------------------------------------------------------------ */

export interface HairstyleSelection {
  styleId: string;
  length: string;
  color: string;
  texture: string;
  volume: string;
  parting: string;
  bangs: string;
  styling: string;
  accessory: string;
  notes: string;
}

export interface HairOptionSet {
  key: keyof Omit<HairstyleSelection, "styleId" | "notes">;
  label: string;
  options: string[];
}

/* ------------------------------------------------------------------ */
/* Generation / assets                                                 */
/* ------------------------------------------------------------------ */

export type GenerationKind =
  | "portrait"
  | "appearance"
  | "hairstyle"
  | "turnaround"
  | "environment"
  | "model3d";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Generation {
  id: string;
  identityId: string;
  versionId: string;
  kind: GenerationKind;
  label: string;
  view: string;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string;
  params: Record<string, unknown>;
  status: "completed" | "failed";
  error: string | null;
  assetId: string | null;
  review: ReviewStatus;
  reviewNote: string;
  createdAt: string;
  meta: Record<string, unknown>;
}

export type AssetKind = "photo" | "generation" | "model" | "audio" | "export";

export interface Asset {
  id: string;
  identityId: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  originalName: string;
  createdAt: string;
}

export interface Photo {
  id: string;
  identityId: string;
  originalName: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  view: ViewKey;
  expression: string;
  hairstyle: string;
  notes: string;
  createdAt: string;
  analysis: FaceAnalysis | null;
}

export interface ModelAsset {
  id: string;
  identityId: string;
  name: string;
  format: "glb" | "gltf" | "fbx" | "obj";
  source: "upload" | "generated";
  bytes: number;
  createdAt: string;
  notes: string;
  lod: string;
  rigged: boolean;
  provider: string;
}

export interface AudioTake {
  id: string;
  identityId: string;
  name: string;
  kind: "vocal" | "instrumental" | "mix" | "reference";
  bytes: number;
  mime: string;
  durationSeconds: number | null;
  analysis: AudioAnalysis | null;
  createdAt: string;
  notes: string;
}

export interface AudioAnalysis {
  sampleRate: number;
  durationSeconds: number;
  peakDb: number;
  rmsDb: number;
  medianF0: number | null;
  f0Min: number | null;
  f0Max: number | null;
  voicedRatio: number;
  vibratoRateHz: number | null;
  vibratoExtentCents: number | null;
  energyContour: number[];
  pitchContour: (number | null)[];
  frameSeconds: number;
  method: string;
}

export interface Creation {
  id: string;
  identityId: string;
  title: string;
  kind: string;
  collection: string;
  generationId: string | null;
  createdAt: string;
  notes: string;
}

export interface Settings {
  /** Explicit consent gate: reference photos are only sent to a provider when true. */
  allowExternalReferenceUpload: boolean;
  defaultIdentityStrength: number;
  preferredImageProvider: "fal" | "openai";
  defaultEnvironmentId: string;
  requireReviewBeforeMaster: boolean;
  theme: "cream";
  studioName: string;
}

export interface ProviderModelOption {
  id: string;
  label: string;
  note: string;
  costHint: string;
  supports: GenerationKind[];
  requiresKey: "FAL_KEY" | "OPENAI_API_KEY";
}

export interface ProviderStatus {
  id: "fal" | "openai";
  name: string;
  envVar: string;
  configured: boolean;
  docsUrl: string;
  purpose: string;
  models: ProviderModelOption[];
}

export interface IntegrationRequirement {
  id: string;
  area: "images" | "3d" | "animation" | "voice";
  title: string;
  honestStatus: string;
  endpoint: string | null;
  needs: string;
  covered: boolean;
}

export interface ReadinessFeature {
  key: string;
  label: string;
  help: string;
  status: "measured" | "user" | "missing";
  value: string;
  missingViews: ViewKey[];
  suggestedValue: string | null;
  measurements: { key: string; label: string; value: string }[];
}

export interface IdentityReadiness {
  features: ReadinessFeature[];
  approvedCount: number;
  totalCount: number;
  coverage: { view: ViewKey; count: number }[];
  missingViews: ViewKey[];
  canApprove: boolean;
  blocking: string[];
  analyzedPhotos: number;
  totalPhotos: number;
  hasMasterPortrait: boolean;
}

export interface StudioStats {
  photos: number;
  analyzedPhotos: number;
  generations: number;
  approvedGenerations: number;
  models: number;
  audioTakes: number;
  versions: number;
  storageBytes: number;
}

export interface AppState {
  identity: Identity;
  versions: IdentityVersion[];
  masterVersion: IdentityVersion | null;
  draft: IdentityVersion;
  photos: Photo[];
  generations: Generation[];
  models: ModelAsset[];
  audio: AudioTake[];
  creations: Creation[];
  exports: Asset[];
  settings: Settings;
  providers: ProviderStatus[];
  integrations: IntegrationRequirement[];
  readiness: IdentityReadiness;
  stats: StudioStats;
  dataDir: string;
}

export interface PhaseInfo {
  id: string;
  title: string;
  status: "ready" | "needs-keys" | "research";
  summary: string;
  detail: string;
}
